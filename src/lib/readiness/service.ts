import { canConfigureCampus } from "@/lib/school-ai/setup-role";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { isInstitutionAuthority } from "@/lib/auth/institution";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { getLocalePackage } from "@/lib/locale/store";
import { parseSetupDraft, unresolvedOptionalWork, type AdoptionMode as SetupAdoptionMode, type InstitutionType, type OptionalWorkKey } from "@/lib/onboarding/setup-state";
import { SETUP_AREAS, SETUP_AREA_TITLES, setupAreaHref, setupAreaTaskKey } from "@/lib/onboarding/setup-areas";
import { buildSetupProgress } from "./progress";
import { evaluateReadiness, isUnknownClassError, REHEARSAL_STEPS, type AdoptionMode, type ImportFacts, type ReadinessFacts, type RehearsalStep } from "./checks";

type ImportRowJson = { state?: string; errors?: string[] };
// Campus operators configure their campus; group owners and academic leads have separate workspaces.
type ImportDataJson = { rows?: ImportRowJson[] };

/**
 * Leads approve readiness (SKO-391, G17): the institution authority — the group admin of a school group, the school
 * admin of a single school (§1.1; never decided by campus count or a stray owner flag) — or the named setup delegate.
 * Exported for the AI setup-task gate (§10.8, G42).
 */
export async function isReadinessLead(tx: TxClient, user: AuthUser): Promise<boolean> {
  if (isInstitutionAuthority(user)) return true;
  const setup = await tx.institutionSetup.findUnique({ where: { schoolId: user.schoolId }, select: { delegateUserId: true } });
  return setup?.delegateUserId === user.userId;
}

/** Import batches read for readiness; reaching the cap means the import totals are partial (SKAI-160). */
const IMPORT_BATCH_CAP = 50;

async function gatherFacts(tx: TxClient, schoolId: string, rehearsal: ReadinessFacts["rehearsal"]): Promise<ReadinessFacts> {
  const school = { schoolId };
  const [setup, campusRows, localePolicy, activeCycles, classes, classesWithTeacher, teachers, students, withGuardian, reviewRequired, feeStructures, openingBalances, batches] = await Promise.all([
    tx.institutionSetup.findUnique({ where: school, select: { adoptionMode: true, institutionType: true } }),
    // Every count stays scoped to this school; the per-campus counts reuse the same filters as the school-wide ones.
    tx.campus.findMany({ where: { ...school, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { classes: { where: { archivedAt: null } }, students: { where: { archivedAt: null } } } } } }),
    tx.localePolicy.count({ where: { ...school, campusId: null, status: "ACTIVE" } }),
    tx.academicCycle.count({ where: { ...school, status: "ACTIVE" } }),
    tx.class.count({ where: { ...school, archivedAt: null } }),
    tx.class.count({ where: { ...school, archivedAt: null, classTeacherId: { not: null } } }),
    tx.user.count({ where: { ...school, role: "TEACHER", isActive: true } }),
    tx.student.count({ where: { ...school, archivedAt: null } }),
    tx.student.count({ where: { ...school, archivedAt: null, guardianRelationships: { some: { status: "ACTIVE" } } } }),
    tx.guardianRelationship.count({ where: { ...school, status: "REVIEW_REQUIRED" } }),
    tx.feeStructure.count({ where: school }),
    tx.feeCarryForward.count({ where: school }),
    tx.importBatch.findMany({ where: { ...school, state: { not: "EXPIRED" } }, select: { id: true, kind: true, state: true, sourceName: true, data: true }, orderBy: { createdAt: "desc" }, take: IMPORT_BATCH_CAP }),
  ]);
  const imports: ImportFacts = { pendingBatches: 0, rejectedRows: 0, unresolvedRows: 0, unknownClassRows: 0, batches: [] };
  for (const batch of batches) {
    const rows = ((batch.data as ImportDataJson | null)?.rows ?? []);
    const count = (state: string) => rows.filter(row => row.state === state).length;
    const unknownClass = rows.filter(row => row.state === "REJECTED" && (row.errors ?? []).some(isUnknownClassError)).length;
    const item = { id: batch.id, kind: batch.kind, state: batch.state, sourceName: batch.sourceName, total: rows.length, accepted: count("ACCEPTED"), rejected: count("REJECTED"), unresolved: count("UNRESOLVED"), unknownClass };
    imports.batches.push(item);
    if (batch.state === "STAGED" || batch.state === "PARTIAL") imports.pendingBatches += 1;
    imports.rejectedRows += item.rejected; imports.unresolvedRows += item.unresolved; imports.unknownClassRows += unknownClass;
  }
  const campuses = campusRows.length;
  const campusBreakdown = campusRows.map(campus => ({ id: campus.id, name: campus.name, classes: campus._count.classes, students: campus._count.students }));
  return {
    campusBreakdown,
    adoptionMode: (setup?.adoptionMode as AdoptionMode | null) ?? "FULL_OPERATIONS",
    institutionType: (setup?.institutionType as ReadinessFacts["institutionType"] | undefined) ?? "STANDALONE",
    campuses, localeConfirmed: localePolicy > 0, activeCycles, classes, classesWithTeacher, teachers, students,
    studentsWithoutGuardian: students - withGuardian, guardianReviewRequired: reviewRequired, feeStructures, openingBalances, imports, rehearsal,
  };
}

const OPTIONAL_TITLES: Record<OptionalWorkKey, string> = {
  logo: "Upload the school logo", contact: "Add school phone or website", sessionDates: "Confirm academic session dates",
  principals: "Name a principal for every campus", feesPayroll: "Configure fees and payroll", roster: "Complete the pupil roster", curriculum: "Map the curriculum",
};

async function readinessRow(tx: TxClient, user: AuthUser) {
  return tx.schoolReadiness.upsert({ where: { schoolId: user.schoolId }, create: { schoolId: user.schoolId }, update: {} });
}

/** Optional follow-ups come from what onboarding left unresolved; each stays visible until done or deferred. */
async function seedOptionalTasks(tx: TxClient, user: AuthUser) {
  // The wizard's setup areas (SKAI-111), also for schools that predate onboarding. The logo is seeded below only
  // while it is missing, so it is not repeated here.
  const areas = SETUP_AREAS.filter(id => id !== "logo").map(id => ({ schoolId: user.schoolId, key: setupAreaTaskKey(id), title: SETUP_AREA_TITLES[id], createdById: user.userId }));
  await tx.readinessTask.createMany({ data: areas, skipDuplicates: true });
  const setup = await tx.institutionSetup.findUnique({ where: { schoolId: user.schoolId } });
  if (!setup) return;
  const keys = unresolvedOptionalWork(setup.institutionType as InstitutionType, setup.adoptionMode as SetupAdoptionMode | null, parseSetupDraft(setup.draft));
  // One insert, existing follow-ups untouched: a per-key upsert outlived the transaction timeout on a slow database.
  await tx.readinessTask.createMany({ data: keys.map(key => ({ schoolId: user.schoolId, key, title: OPTIONAL_TITLES[key], createdById: user.userId })), skipDuplicates: true });
}

export async function readinessView(user: AuthUser, now = new Date()) {
  return schoolAiTransaction(user, async tx => {
    const lead = await isReadinessLead(tx, user);
    if (!lead) {
      // Other staff see only the follow-ups they own.
      const tasks = await tx.readinessTask.findMany({ where: { schoolId: user.schoolId, ownerId: user.userId }, orderBy: { createdAt: "asc" } });
      if (!tasks.length) throw new ApiError("School readiness is managed by the implementation lead.", 403);
      const audit = await taskAudit(tx, user.schoolId, tasks.map(task => task.id));
      const people = await tx.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(audit.map(row => row.userId))] } }, select: { id: true, fullName: true } });
      return { lead: false as const, tasks: withHistory(tasks, audit, new Map(people.map(person => [person.id, person.fullName]))), staff: [] as Array<{ id: string; fullName: string; role: string }>,
        // Progress over only the follow-ups this person owns: the records they are allowed to open (SKAI-160).
        progress: buildSetupProgress({ tasks, viewer: { role: user.role }, generatedAt: now }) };
    }
    await seedOptionalTasks(tx, user);
    const row = await readinessRow(tx, user);
    const facts = await gatherFacts(tx, user.schoolId, row.rehearsal as ReadinessFacts["rehearsal"]);
    const [tasks, staff, locale, audit] = await Promise.all([
      tx.readinessTask.findMany({ where: { schoolId: user.schoolId }, orderBy: { createdAt: "asc" } }),
      tx.user.findMany({ where: { schoolId: user.schoolId, isActive: true, role: { notIn: ["STUDENT", "PARENT", "APP_OWNER"] } }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } }),
      getLocalePackage(user.schoolId, null, now, undefined, tx),
      taskAudit(tx, user.schoolId),
    ]);
    const viewer = { role: user.role, institutionKind: user.institutionKind, isInstitutionOwner: user.isInstitutionOwner };
    const evaluation = evaluateReadiness(facts, viewer);
    const areas = SETUP_AREAS.map(id => ({ id, ...setupAreaHref(id, viewer) }));
    const progress = buildSetupProgress({ tasks, areas, checks: evaluation.checks, campuses: evaluation.campuses, school: { classes: facts.classes, students: facts.students }, viewer, generatedAt: now,
      partial: facts.imports.batches.length >= IMPORT_BATCH_CAP ? ["imports"] : [] });
    return { lead: true as const, progress, readiness: { status: row.status, version: row.version, approvedById: row.approvedById, approvedAt: row.approvedAt, evidence: row.evidence, rehearsal: row.rehearsal },
      facts, ...evaluation, tasks: withHistory(tasks, audit, new Map(staff.map(person => [person.id, person.fullName]))), staff, locale: { country: locale.country, timezone: locale.timezone, currency: locale.currency },
      // The setup questionnaire lives in AI Workflows (/ai?setup=1).
      aiSetup: canConfigureCampus(user.role),
      // Only the institution authority chooses the adoption mode, and only before go-live (SKAI-912).
      canSwitchMode: isInstitutionAuthority(user) && row.status !== "READY" && Boolean(await tx.institutionSetup.findUnique({ where: { schoolId: user.schoolId }, select: { id: true } })),
      // The setup areas in wizard order, each with where this viewer sets it up (status comes from its task).
      areas };
  });
}

export const approveInput = z.object({ expectedVersion: z.number().int().min(0) }).strict();
export async function approveReadiness(user: AuthUser, raw: unknown, now = new Date()) {
  const input = approveInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    if (!(await isReadinessLead(tx, user))) throw new ApiError("Only the implementation lead can approve readiness.", 403);
    const row = await readinessRow(tx, user);
    if (row.status === "READY") throw new ApiError("Readiness is already approved.", 409);
    if (row.version !== input.expectedVersion) throw new ApiError("Readiness changed. Review the current checks.", 409);
    // Checks are re-evaluated at approval time; a stale screen cannot approve.
    const facts = await gatherFacts(tx, user.schoolId, row.rehearsal as ReadinessFacts["rehearsal"]);
    const result = evaluateReadiness(facts);
    if (!result.ready) throw new ApiError(`Required checks are not complete: ${result.checks.filter(c => c.required && !c.passed).map(c => c.id).join(", ")}.`, 409);
    const outstanding = await tx.readinessTask.findMany({ where: { schoolId: user.schoolId, status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { key: true, title: true, ownerId: true, dueOn: true } });
    const evidence = { approvedFor: facts.adoptionMode, checks: result.checks, imports: facts.imports, outstandingOptional: outstanding } as unknown as Prisma.InputJsonValue;
    const updated = await tx.schoolReadiness.update({ where: { schoolId: user.schoolId }, data: { status: "READY", approvedById: user.userId, approvedAt: now, evidence, version: row.version + 1 } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_readiness", recordId: updated.id, userId: user.userId, oldValue: { status: "SETUP", version: row.version }, newValue: { status: "READY", version: updated.version } } });
    return updated;
  });
}

// ─── Adoption mode (SKAI-912) ─────────────────────────────────────
// Switching mode changes which checks gate the first class, never the data: classes, rosters, follow-ups and
// rehearsal times all stay. The readiness version moves, so a screen opened under the old mode cannot approve.
export const modeInput = z.object({ mode: z.enum(["EXAM_STUDIO", "FULL_OPERATIONS"]), expectedVersion: z.number().int().min(0) }).strict();
export async function switchAdoptionMode(user: AuthUser, raw: unknown) {
  const input = modeInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    if (!isInstitutionAuthority(user)) throw new ApiError("Only the school or group administrator can change how the school uses Skoolee.", 403);
    const setup = await tx.institutionSetup.findUnique({ where: { schoolId: user.schoolId }, select: { id: true, adoptionMode: true } });
    if (!setup) throw new ApiError("Finish the institution setup first.", 409);
    const row = await readinessRow(tx, user);
    if (row.status === "READY") throw new ApiError("Readiness is already approved. Contact support to change the adoption mode.", 409);
    if (row.version !== input.expectedVersion) throw new ApiError("Readiness changed. Review the current checks.", 409);
    if (setup.adoptionMode === input.mode) return { mode: input.mode, version: row.version };
    await tx.institutionSetup.update({ where: { schoolId: user.schoolId }, data: { adoptionMode: input.mode } });
    const updated = await tx.schoolReadiness.update({ where: { schoolId: user.schoolId }, data: { version: row.version + 1 } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "institution_setup", recordId: setup.id, userId: user.userId, oldValue: { adoptionMode: setup.adoptionMode }, newValue: { action: "adoption_mode.switched", adoptionMode: input.mode } } });
    return { mode: input.mode, version: updated.version };
  });
}

const taskId = z.string().min(1), expectedVersion = z.number().int().min(1).optional();
const dueOn = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-30.").nullable();
export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "DEFERRED"] as const;
export const taskInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), taskId, ownerId: z.string().min(1).nullable(), expectedVersion }).strict(),
  z.object({ action: z.literal("status"), taskId, status: z.enum(TASK_STATUSES), expectedVersion }).strict(),
  z.object({ action: z.literal("schedule"), taskId, dueOn, expectedVersion }).strict(),
  z.object({ action: z.literal("remind"), taskId, expectedVersion }).strict(),
  z.object({ action: z.literal("create"), title: z.string().trim().min(3).max(160), ownerId: z.string().min(1).nullable(), dueOn: dueOn.optional() }).strict(),
]);
const REMIND_EVERY_MS = 86_400_000;
const taskNoticeKey = (id: string) => `readiness-task:${id}`;
type TaskRow = Prisma.ReadinessTaskGetPayload<object>;
const auditValue = (task: TaskRow) => ({ status: task.status, ownerId: task.ownerId, dueOn: task.dueOn?.toISOString().slice(0, 10) ?? null, version: task.version });

/** A due date is a calendar day: today or later, and at most two years out. */
function parseDueOn(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const day = new Date(`${value}T00:00:00Z`), today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) throw new ApiError("Choose a real calendar date.", 400);
  if (day < today) throw new ApiError("The due date cannot be in the past.", 400);
  if (day.getTime() - today.getTime() > 730 * 86_400_000) throw new ApiError("Choose a due date within two years.", 400);
  return day;
}

/** The audit trail (SKAI-155): the tracking changes of these tasks, newest first. One query, so it can run alongside the rest. */
function taskAudit(tx: TxClient, schoolId: string, taskIds?: string[]) {
  return tx.auditLog.findMany({ where: { schoolId, tableName: "readiness_tasks", newValue: { path: ["action"], not: Prisma.AnyNull }, ...(taskIds ? { recordId: { in: taskIds } } : {}) }, orderBy: { createdAt: "desc" }, take: 300, select: { recordId: true, userId: true, newValue: true, createdAt: true } });
}
function withHistory<T extends TaskRow>(tasks: T[], audit: Awaited<ReturnType<typeof taskAudit>>, names: Map<string, string>) {
  const history: Record<string, Array<{ action: string; byName: string; at: string }>> = {};
  for (const row of audit) {
    const action = (row.newValue as { action?: unknown } | null)?.action;
    const list = (history[row.recordId] ??= []);
    if (typeof action === "string" && list.length < 5) list.push({ action, byName: names.get(row.userId) ?? "", at: row.createdAt.toISOString() });
  }
  return tasks.map(task => ({ ...task, dueOn: task.dueOn?.toISOString().slice(0, 10) ?? null, history: history[task.id] ?? [] }));
}

export async function updateReadinessTask(user: AuthUser, raw: unknown, now = new Date()) {
  const input = taskInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const lead = await isReadinessLead(tx, user);
    const assertOwner = async (ownerId: string | null) => {
      if (ownerId && !(await tx.user.findFirst({ where: { id: ownerId, schoolId: user.schoolId, isActive: true, role: { notIn: ["STUDENT", "PARENT", "APP_OWNER"] } }, select: { id: true } }))) throw new ApiError("Choose an active staff member from this school.", 400);
    };
    const audit = (task: TaskRow, oldValue: object | null, action: string) => tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "readiness_tasks", recordId: task.id, userId: user.userId, oldValue: oldValue ?? undefined, newValue: { action, ...auditValue(task) } } });
    if (input.action === "create") {
      if (!lead) throw new ApiError("Only the implementation lead can add follow-ups.", 403);
      await assertOwner(input.ownerId);
      const created = await tx.readinessTask.create({ data: { schoolId: user.schoolId, key: `custom-${crypto.randomUUID()}`, title: input.title, ownerId: input.ownerId, dueOn: parseDueOn(input.dueOn, now), createdById: user.userId } });
      await audit(created, null, "create");
      return created;
    }
    const task = await tx.readinessTask.findFirst({ where: { id: input.taskId, schoolId: user.schoolId } });
    if (!task) throw new ApiError("Task not found.", 404);
    // Only the lead plans the work; the owner moves their own task along but cannot put it off.
    if (!lead && (input.action !== "status" || task.ownerId !== user.userId || input.status === "DEFERRED")) throw new ApiError("You can only update follow-ups assigned to you.", 403);
    if (input.expectedVersion !== undefined && input.expectedVersion !== task.version) throw new ApiError("This task changed since you opened it. Review the latest and try again.", 409);
    let data: Prisma.ReadinessTaskUpdateManyMutationInput & { ownerId?: string | null };
    if (input.action === "assign") {
      await assertOwner(input.ownerId);
      if (input.ownerId === task.ownerId) return task;
      data = { ownerId: input.ownerId, remindedAt: null };
    } else if (input.action === "schedule") {
      data = { dueOn: parseDueOn(input.dueOn, now) };
    } else if (input.action === "remind") {
      if (!task.ownerId) throw new ApiError("Assign this task before sending a reminder.", 409);
      if (task.status === "DONE") throw new ApiError("This task is already done.", 409);
      if (task.remindedAt && now.getTime() - task.remindedAt.getTime() < REMIND_EVERY_MS) throw new ApiError("A reminder was already sent in the last 24 hours.", 409);
      data = { remindedAt: now };
    } else {
      if (input.status === task.status) return task;
      const closed = input.status === "DONE" || input.status === "DEFERRED";
      data = { status: input.status, completedAt: closed ? now : null, completedById: closed ? user.userId : null };
    }
    // The version check and the write are one statement, so two tabs cannot both win.
    const { count } = await tx.readinessTask.updateMany({ where: { id: task.id, schoolId: user.schoolId, version: task.version }, data: { ...data, version: { increment: 1 } } });
    if (count !== 1) throw new ApiError("This task changed since you opened it. Review the latest and try again.", 409);
    const updated = await tx.readinessTask.findUniqueOrThrow({ where: { id: task.id } });
    await audit(updated, auditValue(task), input.action === "status" ? `status:${input.status}` : input.action);
    const noticeKey = taskNoticeKey(task.id);
    if (input.action === "remind" && updated.ownerId) {
      const notice = { title: "Setup task reminder", message: `Please finish: ${updated.title}${updated.dueOn ? ` (due ${updated.dueOn.toISOString().slice(0, 10)})` : ""}.`, link: "/setup/readiness", actorId: user.userId, dueAt: updated.dueOn, lastRemindedAt: now, resolvedAt: null };
      await tx.notification.upsert({ where: { userId_dedupeKey: { userId: updated.ownerId, dedupeKey: noticeKey } },
        create: { ...notice, schoolId: user.schoolId, userId: updated.ownerId, type: "SETUP_TASK", category: "ACTION", sourceType: "readiness_task", sourceId: task.id, dedupeKey: noticeKey, reminderCount: 1 },
        update: { ...notice, isRead: false, readAt: null, reminderCount: { increment: 1 } } });
    } else if ((input.action === "assign" || input.action === "status" && updated.status !== "OPEN" && updated.status !== "IN_PROGRESS") && task.ownerId) {
      // A reminder is resolved by the task: done, put off or handed to someone else.
      await tx.notification.updateMany({ where: { schoolId: user.schoolId, userId: task.ownerId, dedupeKey: noticeKey, resolvedAt: null }, data: { resolvedAt: now, resolution: input.action === "assign" ? "REASSIGNED" : updated.status === "DONE" ? "COMPLETED" : "CANCELLED" } });
    }
    return updated;
  });
}

// ─── Practice rehearsal ───────────────────────────────────────────
// The rehearsal is a read-only preview over the school's real configuration:
// it writes no attendance, assessment, message or money, only the step time.
// Every step can be rehearsed in every mode; the mode only decides which ones gate go-live (rehearsalStepsFor).
export const rehearsalInput = z.object({ step: z.enum(REHEARSAL_STEPS) }).strict();
const SYNTHETIC_LEARNERS = ["Practice learner A", "Practice learner B", "Practice learner C"];

export async function rehearsalPreview(user: AuthUser, raw: unknown, now = new Date()) {
  const { step } = rehearsalInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    if (!(await isReadinessLead(tx, user))) throw new ApiError("Only the implementation lead can run the practice rehearsal.", 403);
    const firstClass = await tx.class.findFirst({ where: { schoolId: user.schoolId, archivedAt: null }, orderBy: [{ academicYear: "desc" }, { name: "asc" }], select: { id: true, name: true, section: true, campusId: true, campus: { select: { name: true } } } });
    if (!firstClass) throw new ApiError("Create the first class before rehearsing.", 409);
    const [subjects, locale] = await Promise.all([
      tx.subject.findMany({ where: { schoolId: user.schoolId, classId: firstClass.id }, select: { name: true }, take: 5 }),
      getLocalePackage(user.schoolId, firstClass.campusId, now, undefined, tx),
    ]);
    const learners = SYNTHETIC_LEARNERS.map((name, index) => ({ name, synthetic: true as const, status: index === 2 ? "ABSENT" : "PRESENT" }));
    const row = await readinessRow(tx, user);
    const rehearsal = { ...(row.rehearsal as Record<string, string>), [step]: now.toISOString() };
    await tx.schoolReadiness.update({ where: { schoolId: user.schoolId }, data: { rehearsal, version: row.version + 1 } });
    return {
      step, practice: true as const, nothingSaved: true as const,
      className: [firstClass.name, firstClass.section].filter(Boolean).join(" "), campusName: firstClass.campus.name,
      timezone: locale.timezone, currency: locale.currency,
      learners, subjects: subjects.map(subject => subject.name),
      rehearsal,
    };
  });
}

export type RehearsalResult = Awaited<ReturnType<typeof rehearsalPreview>>;
export type { RehearsalStep };
