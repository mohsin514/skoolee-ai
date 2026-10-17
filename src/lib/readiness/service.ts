import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { getLocalePackage } from "@/lib/locale/store";
import { parseSetupDraft, unresolvedOptionalWork, type AdoptionMode as SetupAdoptionMode, type InstitutionType, type OptionalWorkKey } from "@/lib/onboarding/setup-state";
import { evaluateReadiness, isUnknownClassError, REHEARSAL_STEPS, type AdoptionMode, type ImportFacts, type ReadinessFacts, type RehearsalStep } from "./checks";

type ImportRowJson = { state?: string; errors?: string[] };
type ImportDataJson = { rows?: ImportRowJson[] };

/** Leads approve readiness: the institution owner, the group super admin, or the named setup delegate (SKO-391). */
async function isReadinessLead(tx: TxClient, user: AuthUser) {
  if (user.role === "SUPER_ADMIN" || (user.isInstitutionOwner && ["ADMIN", "SUPER_ADMIN"].includes(user.role))) return true;
  const setup = await tx.institutionSetup.findUnique({ where: { schoolId: user.schoolId }, select: { delegateUserId: true } });
  return setup?.delegateUserId === user.userId;
}

async function gatherFacts(tx: TxClient, schoolId: string, rehearsal: ReadinessFacts["rehearsal"]): Promise<ReadinessFacts> {
  const school = { schoolId };
  const [setup, campuses, localePolicy, activeCycles, classes, classesWithTeacher, teachers, students, withGuardian, reviewRequired, feeStructures, openingBalances, batches] = await Promise.all([
    tx.institutionSetup.findUnique({ where: school, select: { adoptionMode: true, institutionType: true } }),
    tx.campus.count({ where: school }),
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
    tx.importBatch.findMany({ where: { ...school, state: { not: "EXPIRED" } }, select: { id: true, kind: true, state: true, sourceName: true, data: true }, orderBy: { createdAt: "desc" }, take: 50 }),
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
  return {
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
  const setup = await tx.institutionSetup.findUnique({ where: { schoolId: user.schoolId } });
  if (!setup) return;
  const keys = unresolvedOptionalWork(setup.institutionType as InstitutionType, setup.adoptionMode as SetupAdoptionMode | null, parseSetupDraft(setup.draft));
  for (const key of keys) {
    await tx.readinessTask.upsert({ where: { schoolId_key: { schoolId: user.schoolId, key } }, create: { schoolId: user.schoolId, key, title: OPTIONAL_TITLES[key], createdById: user.userId }, update: {} });
  }
}

export async function readinessView(user: AuthUser, now = new Date()) {
  return schoolAiTransaction(user, async tx => {
    const lead = await isReadinessLead(tx, user);
    if (!lead) {
      // Other staff see only the follow-ups they own.
      const tasks = await tx.readinessTask.findMany({ where: { schoolId: user.schoolId, ownerId: user.userId }, orderBy: { createdAt: "asc" } });
      if (!tasks.length) throw new ApiError("School readiness is managed by the implementation lead.", 403);
      return { lead: false as const, tasks, staff: [] as Array<{ id: string; fullName: string; role: string }> };
    }
    await seedOptionalTasks(tx, user);
    const row = await readinessRow(tx, user);
    const facts = await gatherFacts(tx, user.schoolId, row.rehearsal as ReadinessFacts["rehearsal"]);
    const [tasks, staff, locale] = await Promise.all([
      tx.readinessTask.findMany({ where: { schoolId: user.schoolId }, orderBy: { createdAt: "asc" } }),
      tx.user.findMany({ where: { schoolId: user.schoolId, isActive: true, role: { notIn: ["STUDENT", "PARENT", "APP_OWNER"] } }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } }),
      getLocalePackage(user.schoolId, null, now, undefined, tx),
    ]);
    return { lead: true as const, readiness: { status: row.status, version: row.version, approvedById: row.approvedById, approvedAt: row.approvedAt, evidence: row.evidence, rehearsal: row.rehearsal },
      facts, ...evaluateReadiness(facts), tasks, staff, locale: { country: locale.country, timezone: locale.timezone, currency: locale.currency } };
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
    const outstanding = await tx.readinessTask.findMany({ where: { schoolId: user.schoolId, status: "OPEN" }, select: { key: true, title: true, ownerId: true } });
    const evidence = { approvedFor: facts.adoptionMode, checks: result.checks, imports: facts.imports, outstandingOptional: outstanding } as unknown as Prisma.InputJsonValue;
    const updated = await tx.schoolReadiness.update({ where: { schoolId: user.schoolId }, data: { status: "READY", approvedById: user.userId, approvedAt: now, evidence, version: row.version + 1 } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_readiness", recordId: updated.id, userId: user.userId, oldValue: { status: "SETUP", version: row.version }, newValue: { status: "READY", version: updated.version } } });
    return updated;
  });
}

export const taskInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), taskId: z.string().min(1), ownerId: z.string().min(1).nullable() }).strict(),
  z.object({ action: z.literal("status"), taskId: z.string().min(1), status: z.enum(["OPEN", "DONE", "DEFERRED"]) }).strict(),
  z.object({ action: z.literal("create"), title: z.string().trim().min(3).max(160), ownerId: z.string().min(1).nullable() }).strict(),
]);
export async function updateReadinessTask(user: AuthUser, raw: unknown, now = new Date()) {
  const input = taskInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const lead = await isReadinessLead(tx, user);
    const assertOwner = async (ownerId: string | null) => {
      if (ownerId && !(await tx.user.findFirst({ where: { id: ownerId, schoolId: user.schoolId, isActive: true, role: { notIn: ["STUDENT", "PARENT", "APP_OWNER"] } }, select: { id: true } }))) throw new ApiError("Choose an active staff member from this school.", 400);
    };
    if (input.action === "create") {
      if (!lead) throw new ApiError("Only the implementation lead can add follow-ups.", 403);
      await assertOwner(input.ownerId);
      return tx.readinessTask.create({ data: { schoolId: user.schoolId, key: `custom-${crypto.randomUUID()}`, title: input.title, ownerId: input.ownerId, createdById: user.userId } });
    }
    const task = await tx.readinessTask.findFirst({ where: { id: input.taskId, schoolId: user.schoolId } });
    if (!task) throw new ApiError("Task not found.", 404);
    if (input.action === "assign") {
      if (!lead) throw new ApiError("Only the implementation lead can assign follow-ups.", 403);
      await assertOwner(input.ownerId);
      return tx.readinessTask.update({ where: { id: task.id }, data: { ownerId: input.ownerId } });
    }
    // The owner closes their own task; the lead can close or defer any.
    if (!lead && (task.ownerId !== user.userId || input.status === "DEFERRED")) throw new ApiError("You can only complete follow-ups assigned to you.", 403);
    return tx.readinessTask.update({ where: { id: task.id }, data: { status: input.status, completedAt: input.status === "OPEN" ? null : now, completedById: input.status === "OPEN" ? null : user.userId } });
  });
}

// ─── Practice rehearsal ───────────────────────────────────────────
// The rehearsal is a read-only preview over the school's real configuration:
// it writes no attendance, assessment, message or money, only the step time.
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
