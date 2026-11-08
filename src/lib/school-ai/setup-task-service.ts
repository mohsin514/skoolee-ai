import { Prisma, type SchoolAiSetupTask } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import type { PermissionModule } from "@/lib/permissions";
import { assertConversationActor } from "./conversation-service";
import { assertWorkspacePermission, canManageSetupTasks, isSchoolAiManager, loadWorkspacePermissionSnapshot, resolveWorkerPrincipal, resolveWorkspaceCampus, SCHOOL_AI_STAFF_ROLES, SchoolAiError, type WorkspacePermissionSnapshot } from "./access";
import { getWorkspaceRecordInTransaction, updateWorkspaceRecordInTransaction, workspaceRequestHash } from "./repository";
import { schoolAiTransaction } from "./transaction";
import { readSetupDraft, validateSetupAnswer, type SetupAnswerKey } from "./onboarding";
import { schoolAICopy } from "./copy";
import { setupTaskCreateSchema, setupTaskUpdateSchema, type SetupTask, type SetupTaskDetail } from "./setup-tasks";
const domains: Partial<Record<SetupAnswerKey, PermissionModule>> = { grades: "exams", academicYear: "exams", startDate: "exams", endDate: "exams", workingDays: "timetable", curriculum: "exams", assessmentPolicy: "exams", feePolicy: "fees", resources: "timetable", staff: "staff", students: "students" };
async function fieldAccess(user: AuthUser, field: SetupAnswerKey, permissions: WorkspacePermissionSnapshot, edit = false) { if (domains[field]) await assertWorkspacePermission(user, domains[field]!, edit ? "edit" : "view", permissions); }
// G42: delegating and accepting setup facts belongs to the institution authority or the named readiness lead
// (§10.8 isReadinessLead), not to every campus manager; assignees still answer their own tasks.
async function managerAccess(user: AuthUser, tx: TxClient) { const permissions = await assertConversationActor(user, tx); if (!isSchoolAiManager(user) || !(await canManageSetupTasks(user, tx))) throw new SchoolAiError("Only your school's administrator or setup lead can delegate and accept setup facts.", 403); await assertWorkspacePermission(user, "ai", "edit", permissions); return permissions; }
async function currentAssignee(user: AuthUser, campusId: string, assigneeId: string, field: SetupAnswerKey, tx: TxClient, expectedRole?: string) {
  const staff = await tx.user.findFirst({ where: { id: assigneeId, schoolId: user.schoolId, campusId, isActive: true, role: { in: [...SCHOOL_AI_STAFF_ROLES].filter(role => role !== "SUPER_ADMIN") } }, select: { id: true, email: true, role: true, campusId: true, fullName: true, accessVersion: true } });
  if (!staff || expectedRole && staff.role !== expectedRole) throw new SchoolAiError("Choose an active staff member assigned to this campus.", 403);
  // Never a hand-built AuthUser (C32): the assignee is resolved like any other principal.
  const actor = await resolveWorkerPrincipal({ userId: staff.id, schoolId: user.schoolId, role: staff.role, accessVersion: staff.accessVersion });
  if (!actor) throw new SchoolAiError("Choose an active staff member assigned to this campus.", 403);
  const permissions = await loadWorkspacePermissionSnapshot(actor, tx);
  await assertWorkspacePermission(actor, "ai", "view", permissions); await assertWorkspacePermission(actor, "ai", "add", permissions); await fieldAccess(actor, field, permissions);
  return staff;
}
async function readTask(user: AuthUser, id: string, tx: TxClient) {
  const permissions = await assertConversationActor(user, tx);
  const row = await tx.schoolAiSetupTask.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) } });
  if (!row || !isSchoolAiManager(user) && (row.assigneeId !== user.userId || row.assigneeRole !== user.role)) throw new SchoolAiError("Setup question not found in your current access.", 404);
  await resolveWorkspaceCampus(user, row.campusId, tx); await fieldAccess(user, row.fieldKey as SetupAnswerKey, permissions);
  const record = await tx.schoolAiRecord.findFirst({ where: { id: row.recordId, schoolId: user.schoolId, campusId: row.campusId, kind: "ONBOARDING", status: { not: "ARCHIVED" } }, select: { id: true } });
  if (!record) throw new SchoolAiError("The setup draft is no longer available.", 404);
  if (isSchoolAiManager(user)) await getWorkspaceRecordInTransaction(user, row.recordId, tx, permissions);
  return { row, permissions };
}
async function publicTask(user: AuthUser, row: SchoolAiSetupTask, tx: TxClient, permissions: WorkspacePermissionSnapshot): Promise<SetupTask> {
  const staff = await tx.user.findFirst({ where: { id: row.assigneeId, schoolId: user.schoolId }, select: { fullName: true } });
  const canManage = isSchoolAiManager(user) && (user.role === "SUPER_ADMIN" || permissions.get("ai")?.canEdit === true) && await canManageSetupTasks(user, tx);
  return { id: row.id, campusId: row.campusId, recordId: row.recordId, fieldKey: row.fieldKey as SetupAnswerKey, question: row.question, instructions: row.instructions, requestedById: row.requestedById, assigneeId: row.assigneeId, assigneeName: staff?.fullName ?? "", status: row.status as SetupTask["status"], answer: row.answer, version: row.version, acceptedRecordVersion: row.acceptedRecordVersion, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), canManage, canAnswer: row.assigneeId === user.userId && row.assigneeRole === user.role && permissions.get("ai")?.canAdd === true };
}
async function revision(row: SchoolAiSetupTask, actor: AuthUser, action: string, tx: TxClient) {
  await tx.schoolAiSetupTaskRevision.create({ data: { schoolId: row.schoolId, taskId: row.id, version: row.version, action, actorId: actor.userId, data: { fieldKey: row.fieldKey, instructions: row.instructions, assigneeId: row.assigneeId, assigneeRole: row.assigneeRole, status: row.status, answer: row.answer, acceptedRecordVersion: row.acceptedRecordVersion } } });
}
export async function setupTaskOptions(user: AuthUser, recordId: string, field: SetupAnswerKey) {
  return schoolAiTransaction(user, async tx => {
    const permissions = await managerAccess(user, tx); await fieldAccess(user, field, permissions);
    const record = await getWorkspaceRecordInTransaction(user, recordId, tx, permissions);
    if (record.kind !== "ONBOARDING" || !record.campusId || record.status === "ARCHIVED") throw new SchoolAiError("Choose a campus setup draft.", 400);
    const rows = await tx.user.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId, isActive: true, role: { in: [...SCHOOL_AI_STAFF_ROLES].filter(role => role !== "SUPER_ADMIN") } }, select: { id: true }, orderBy: [{ fullName: "asc" }, { id: "asc" }], take: 200 });
    const staff: { id: string; name: string; role: string }[] = [];
    for (const row of rows) { try { const person = await currentAssignee(user, record.campusId, row.id, field, tx); staff.push({ id: person.id, name: person.fullName, role: person.role }); } catch (error) { if (!(error instanceof SchoolAiError && error.status === 403)) throw error; } }
    return { staff };
  });
}
export async function createSetupTask(user: AuthUser, input: unknown) {
  const data = setupTaskCreateSchema.parse(input);
  const work = () => schoolAiTransaction(user, async tx => {
    const permissions = await managerAccess(user, tx); await fieldAccess(user, data.fieldKey, permissions);
    const record = await getWorkspaceRecordInTransaction(user, data.recordId, tx, permissions);
    if (record.kind !== "ONBOARDING" || !record.campusId || record.status === "ARCHIVED") throw new SchoolAiError("Choose a campus setup draft.", 400);
    const person = await currentAssignee(user, record.campusId, data.assigneeId, data.fieldKey, tx);
    const hash = workspaceRequestHash({ ...data, role: person.role, campusId: record.campusId });
    const existing = await tx.schoolAiSetupTask.findFirst({ where: { schoolId: user.schoolId, requestedById: user.userId, idempotencyKey: data.idempotencyKey } });
    if (existing) { if (existing.requestHash !== hash) throw new SchoolAiError("This delegation key belongs to different content.", 409); return publicTask(user, existing, tx, permissions); }
    const duplicate = await tx.schoolAiSetupTask.findFirst({ where: { schoolId: user.schoolId, recordId: record.id, fieldKey: data.fieldKey, status: { in: ["OPEN", "ANSWERED"] } } });
    if (duplicate) throw new SchoolAiError("This setup question already has an open assignment. Review or cancel it first.", 409, "SETUP_TASK_ALREADY_OPEN");
    const copy = schoolAICopy("en");
    const row = await tx.schoolAiSetupTask.create({ data: { schoolId: user.schoolId, campusId: record.campusId, recordId: record.id, fieldKey: data.fieldKey, question: copy[data.fieldKey === "curriculum" ? "curriculumQuestion" : data.fieldKey], instructions: data.instructions, requestedById: user.userId, assigneeId: person.id, assigneeRole: person.role, idempotencyKey: data.idempotencyKey, requestHash: hash } });
    await revision(row, user, "CREATE", tx); return publicTask(user, row, tx, permissions);
  });
  try { return await work(); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return work(); throw error; }
}
export async function listSetupTasks(user: AuthUser, options: { campusId?: string | null; recordId?: string; before?: string } = {}) {
  return schoolAiTransaction(user, async tx => {
    await assertConversationActor(user, tx); const campusId = await resolveWorkspaceCampus(user, options.campusId, tx);
    if (!campusId) return { tasks: [], nextCursor: null };
    const where = { schoolId: user.schoolId, campusId, ...(options.recordId ? { recordId: options.recordId } : {}), ...(isSchoolAiManager(user) ? {} : { assigneeId: user.userId, assigneeRole: user.role }) };
    const cursor = options.before ? await tx.schoolAiSetupTask.findFirst({ where: { id: options.before, ...where }, select: { id: true, createdAt: true } }) : null;
    if (options.before && !cursor) throw new SchoolAiError("Setup question page is unavailable.", 404);
    const rows = await tx.schoolAiSetupTask.findMany({ where: { ...where, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21 });
    const tasks: SetupTask[] = [];
    for (const row of rows.slice(0, 20)) { try { const accessible = await readTask(user, row.id, tx); tasks.push(await publicTask(user, row, tx, accessible.permissions)); } catch (error) { if (!(error instanceof SchoolAiError && [403, 404].includes(error.status))) throw error; } }
    return { tasks, nextCursor: rows.length > 20 ? rows[19].id : null };
  });
}
export async function getSetupTask(user: AuthUser, id: string, beforeVersion?: number): Promise<SetupTaskDetail> {
  return schoolAiTransaction(user, async tx => {
    const { row, permissions } = await readTask(user, id, tx);
    const revisions = await tx.schoolAiSetupTaskRevision.findMany({ where: { schoolId: user.schoolId, taskId: id, ...(beforeVersion ? { version: { lt: beforeVersion } } : {}) }, orderBy: { version: "desc" }, take: 21 });
    const actors = await tx.user.findMany({ where: { schoolId: user.schoolId, id: { in: revisions.map(item => item.actorId) } }, select: { id: true, fullName: true } });
    const task = await publicTask(user, row, tx, permissions);
    const record = task.canManage ? await getWorkspaceRecordInTransaction(user, row.recordId, tx, permissions) : null;
    return { task, revisions: revisions.slice(0, 20).map(item => ({ version: item.version, action: item.action, actorName: actors.find(actor => actor.id === item.actorId)?.fullName ?? "", createdAt: item.createdAt.toISOString(), answer: typeof (item.data as Record<string, unknown>).answer === "string" ? (item.data as Record<string, string>).answer : null })), nextVersion: revisions.length > 20 ? revisions[19].version : null, ...(record ? { currentFact: { value: readSetupDraft(record.data).answers[row.fieldKey as SetupAnswerKey] ?? "", recordVersion: record.version, status: record.status } } : {}) };
  });
}
export async function updateSetupTask(user: AuthUser, id: string, input: unknown) {
  const data = setupTaskUpdateSchema.parse(input);
  return schoolAiTransaction(user, async tx => {
    const { row, permissions } = await readTask(user, id, tx);
    if (data.action === "answer") {
      if (row.assigneeId !== user.userId || row.assigneeRole !== user.role) throw new SchoolAiError("Only the assigned colleague can propose this answer.", 403);
      await currentAssignee(user, row.campusId, user.userId, row.fieldKey as SetupAnswerKey, tx, row.assigneeRole);
      if (row.status === "ANSWERED" && row.version === data.version + 1 && row.answer === data.answer) return { task: await publicTask(user, row, tx, permissions) };
      if (!["OPEN", "ANSWERED"].includes(row.status)) throw new SchoolAiError("This setup question is already closed.", 409);
    } else {
      await managerAccess(user, tx); await fieldAccess(user, row.fieldKey as SetupAnswerKey, permissions, data.action === "accept");
      if (data.action === "accept" && row.status === "ACCEPTED" && row.version === data.version + 1 && row.acceptedRecordVersion === data.recordVersion + 1) return { task: await publicTask(user, row, tx, permissions), record: await getWorkspaceRecordInTransaction(user, row.recordId, tx, permissions) };
      if (data.action === "cancel" && row.status === "CANCELLED" && row.version === data.version + 1) return { task: await publicTask(user, row, tx, permissions) };
      if (data.action === "accept" && (row.status !== "ANSWERED" || !row.answer)) throw new SchoolAiError("The colleague must propose an answer before acceptance.", 409);
      if (data.action === "cancel" && !["OPEN", "ANSWERED"].includes(row.status)) throw new SchoolAiError("This setup question is already closed.", 409);
    }
    if (row.version !== data.version) throw new SchoolAiError("This setup question changed. Reload before continuing.", 409, "STALE_SETUP_TASK");
    let record;
    if (data.action === "accept") {
      await currentAssignee(user, row.campusId, row.assigneeId, row.fieldKey as SetupAnswerKey, tx, row.assigneeRole);
      const current = await getWorkspaceRecordInTransaction(user, row.recordId, tx, permissions), draft = readSetupDraft(current.data), key = row.fieldKey as SetupAnswerKey;
      if (current.version !== data.recordVersion) throw new SchoolAiError("The setup draft changed. Compare the latest value before accepting.", 409, "STALE_WORKSPACE_VERSION");
      if (validateSetupAnswer(key, row.answer!, draft.answers) || key === "firstOutcome" && !["exams", "timetable", "fees", "records", "complete"].includes(row.answer!)) throw new SchoolAiError("The proposed answer is not valid for this setup field.", 400, "SETUP_TASK_INVALID_ANSWER");
      record = await updateWorkspaceRecordInTransaction(user, row.recordId, { version: data.recordVersion, action: "save", data: { ...draft, answers: { ...draft.answers, [key]: row.answer }, confirmedKeys: draft.confirmedKeys.filter(item => item !== key) } }, tx, permissions);
    }
    const changed = await tx.schoolAiSetupTask.update({ where: { id: row.id }, data: { version: { increment: 1 }, ...(data.action === "answer" ? { answer: data.answer, status: "ANSWERED", answeredAt: new Date() } : data.action === "accept" ? { status: "ACCEPTED", acceptedAt: new Date(), acceptedRecordVersion: record!.version } : { status: "CANCELLED" }) } });
    await revision(changed, user, data.action.toUpperCase(), tx);
    return { task: await publicTask(user, changed, tx, permissions), ...(record ? { record } : {}) };
  });
}
