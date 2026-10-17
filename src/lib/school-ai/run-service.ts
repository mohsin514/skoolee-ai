import { ZodError } from "zod";
import { Prisma, type PrismaClient, type SchoolAiRun } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { assertSchoolOperational, BillingAccessError } from "@/lib/billing/entitlements";
import { assertApprovalRole, assertSchoolAiAccess, assertWorkspaceDomainPermission, assertWorkspaceSubject, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, SchoolAiError } from "./access";
import { getWorkspaceRecordInTransaction, workspaceRequestHash } from "./repository";
import { assertSchoolAiOperationAccess, executionOperationSchema, executeSchoolAiToolInTransaction, previewSchoolAiExecution } from "./execution";
import { schoolAiTransaction } from "./transaction";
import { assertSchoolSetupRecordAccess } from "./school-setup-service";
import { automationPolicySchema, operationPolicyScope, runCreateSchema, runStepsSchema, runUpdateSchema, validateRunWindow, type SchoolRun, type RunStep } from "./runs";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const scope = (user: AuthUser) => ({ schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) });
async function access(user: AuthUser, db: TxClient) {
  assertApprovalRole(user);
  const account = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, role: user.role, isActive: true, accessVersion: user.accessVersion ?? 0, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId }) }, select: { id: true } });
  if (!account) throw new SchoolAiError("Your school access changed.", 403, "ACCESS_CHANGED");
  const permissions = await loadWorkspacePermissionSnapshot(user, db);
  await assertSchoolAiAccess(user, "view", permissions); await assertSchoolAiAccess(user, "edit", permissions);
  await assertSchoolOperational(user.schoolId, db);
  return permissions;
}
function output(run: SchoolAiRun): SchoolRun { return { id: run.id, title: run.title, campusId: run.campusId, status: run.status as SchoolRun["status"], version: run.version, steps: runStepsSchema.parse(run.steps), nextStep: run.nextStep, receipts: run.receipts as unknown as SchoolRun["receipts"], errorCode: run.errorCode, scheduledAt: run.scheduledAt.toISOString(), expiresAt: run.expiresAt.toISOString(), createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null }; }
async function checkSteps(user: AuthUser, steps: RunStep[], campusId: string, db: TxClient, currentVersion = true) {
  const permissions = await loadWorkspacePermissionSnapshot(user, db);
  for (const step of steps) {
    await assertSchoolAiOperationAccess(user, executionOperationSchema.parse(step.operation), db);
    const record = await getWorkspaceRecordInTransaction(user, step.recordId, db, permissions);
    if (record.campusId !== campusId || currentVersion && (record.version !== step.version || record.status !== "APPROVED")) throw new SchoolAiError("A step changed. Review the current approved version.", 409, "STALE_WORKSPACE_VERSION");
    // Titles and receipt references also reveal the original reviewed scope.
    // Editing the current proposal cannot grant access to a pinned older step.
    const saved = await db.schoolAiRevision.findFirst({ where: { schoolId: user.schoolId, campusId, recordId: step.recordId, version: step.version, status: "APPROVED" }, select: { data: true } });
    if (!saved) throw new SchoolAiError("The reviewed step is no longer accessible.", 404, "PERMISSION_DENIED");
    const data = saved.data as Record<string, unknown>;
    await assertWorkspaceDomainPermission(user, record.kind, data, "view", permissions);
    await assertWorkspaceSubject(user, campusId, data, db);
    if (step.operation === "setup.apply_changes") await assertSchoolSetupRecordAccess(user, step.recordId, db, step.version);
  }
}
async function policy(user: AuthUser, run: Pick<SchoolAiRun, "campusId" | "policyId" | "policyVersion" | "expiresAt">, steps: RunStep[], db: TxClient, budget = false) {
  if (!run.policyId) return;
  const record = await getWorkspaceRecordInTransaction(user, run.policyId, db, await loadWorkspacePermissionSnapshot(user, db));
  if (record.kind !== "POLICY" || record.status !== "APPROVED" || record.campusId !== run.campusId || run.policyVersion !== null && record.version !== run.policyVersion) throw new SchoolAiError("The reviewed automation policy changed.", 409, "POLICY_CHANGED");
  const rules = automationPolicySchema.parse(record.data.automation);
  if (record.data.mode !== "approval_required" || !rules.enabled || new Date(rules.expiresAt) <= new Date() || run.expiresAt > new Date(rules.expiresAt) || steps.some(s => !rules.operations.includes(s.operation) || record.data.scope !== "school" && record.data.scope !== operationPolicyScope(s.operation))) throw new SchoolAiError("The action is outside this policy's limits or expiry.", 409, "POLICY_LIMIT");
  if (budget) {
    const previous = await db.schoolAiRun.findMany({ where: { schoolId: user.schoolId, campusId: run.campusId, policyId: run.policyId, policyVersion: record.version }, select: { steps: true }, take: 101 });
    if (previous.length >= rules.maxRuns || previous.reduce((total, row) => total + runStepsSchema.parse(row.steps).length, steps.length) > rules.maxActions) throw new SchoolAiError("This policy's run or action budget has been used.", 409, "POLICY_BUDGET");
  }
  return record.version;
}
async function audit(user: AuthUser, row: SchoolAiRun, action: string, db: TxClient) { await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_runs", recordId: row.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { action, version: row.version, status: row.status, nextStep: row.nextStep } } }); }
export async function createSchoolRun(user: AuthUser, raw: unknown) {
  const input = runCreateSchema.parse(raw), scheduledAt = new Date(input.scheduledAt), expiresAt = new Date(input.expiresAt), hash = workspaceRequestHash(input);
  const replay = await schoolAiTransaction(user, async db => { await access(user, db); const saved = await db.schoolAiRun.findFirst({ where: { schoolId: user.schoolId, actorId: user.userId, idempotencyKey: input.idempotencyKey } }); if (!saved) return null; if (saved.requestHash !== hash) throw new SchoolAiError("This run key belongs to different work.", 409); await checkSteps(user, runStepsSchema.parse(saved.steps), saved.campusId, db, false); return output(saved); });
  if (replay) return replay;
  validateRunWindow(scheduledAt, expiresAt, new Date());
  // User-reviewed hashes are rechecked now and again atomically at execution.
  for (const step of input.steps) { const actual = await previewSchoolAiExecution(user, step.recordId, executionOperationSchema.parse(step.operation), step.version); if (actual.previewHash !== step.previewHash) throw new SchoolAiError("Review a fresh preview before scheduling this action.", 409, "STALE_EXECUTION_PREVIEW"); }
  return schoolAiTransaction(user, async db => {
    await access(user, db); const campusId = await resolveWorkspaceCampus(user, input.campusId, db); if (!campusId) throw new SchoolAiError("Choose a campus.", 422);
    const previous = await db.schoolAiRun.findFirst({ where: { schoolId: user.schoolId, actorId: user.userId, idempotencyKey: input.idempotencyKey } });
    if (previous) { if (previous.requestHash !== hash) throw new SchoolAiError("This run key already belongs to different work.", 409); await checkSteps(user, runStepsSchema.parse(previous.steps), previous.campusId, db, false); return output(previous); }
    if (await db.schoolAiRun.count({ where: { schoolId: user.schoolId, campusId, status: { in: ["QUEUED", "PAUSED"] } } }) >= 100) throw new SchoolAiError("Complete or cancel an existing run before scheduling more work.", 409, "RUN_LIMIT");
    await checkSteps(user, input.steps, campusId, db);
    const policyVersion = await policy(user, { campusId, policyId: input.policyId ?? null, policyVersion: null, expiresAt }, input.steps, db, true);
    const row = await db.schoolAiRun.create({ data: { schoolId: user.schoolId, campusId, title: input.title, actorId: user.userId, actorRole: user.role, accessVersion: user.accessVersion ?? 0, policyId: input.policyId ?? null, policyVersion: policyVersion ?? null, idempotencyKey: input.idempotencyKey, requestHash: hash, steps: json(input.steps), scheduledAt, expiresAt } }); await audit(user, row, "CREATE", db); return output(row);
  });
}
export async function listSchoolRuns(user: AuthUser, campusId: string) { return schoolAiTransaction(user, async db => { await access(user, db); await resolveWorkspaceCampus(user, campusId, db); const rows = await db.schoolAiRun.findMany({ where: { ...scope(user), campusId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }); const allowed: SchoolRun[] = []; for (const row of rows) { try { await checkSteps(user, runStepsSchema.parse(row.steps), campusId, db, false); allowed.push({ ...output(row), updatedAt: row.updatedAt.toISOString(), owner: { name: "", mine: row.actorId === user.userId } }); } catch (error) { if (!(error instanceof SchoolAiError) || ![403, 404].includes(error.status)) throw error; } }
  // SKO-470: each run names the approver who owns its recovery, and each committed step carries the
  // time its domain receipt was written, so partial work is reconciled against durable evidence.
  const actors = new Map((await db.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(rows.filter(row => allowed.some(run => run.id === row.id)).map(row => row.actorId))] } }, select: { id: true, fullName: true } })).map(person => [person.id, person.fullName]));
  const receiptIds = allowed.flatMap(run => run.receipts.map(receipt => receipt.id));
  const executions = new Map((receiptIds.length ? await db.schoolAiExecution.findMany({ where: { schoolId: user.schoolId, campusId, id: { in: receiptIds } }, select: { id: true, completedAt: true } }) : []).map(execution => [execution.id, execution.completedAt.toISOString()]));
  return allowed.map(run => ({ ...run, owner: { name: actors.get(rows.find(row => row.id === run.id)!.actorId) ?? "", mine: run.owner!.mine }, committedAt: Object.fromEntries(run.receipts.flatMap(receipt => executions.has(receipt.id) ? [[receipt.id, executions.get(receipt.id)!]] : [])) })); }); }
export async function updateSchoolRun(user: AuthUser, id: string, raw: unknown) {
  const input = runUpdateSchema.parse(raw);
  return schoolAiTransaction(user, async db => {
    await access(user, db); await db.$queryRaw`SELECT id FROM school_ai_runs WHERE id=${id} AND school_id=${user.schoolId} FOR UPDATE`;
    const row = await db.schoolAiRun.findFirst({ where: { id, ...scope(user) } }); if (!row) throw new SchoolAiError("Run not found.", 404);
    const steps = runStepsSchema.parse(row.steps); await checkSteps(user, steps, row.campusId, db, false);
    if (row.version !== input.version) throw new SchoolAiError("The run changed. Refresh its current progress.", 409, "STALE_RUN");
    if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(row.status)) throw new SchoolAiError("This run has already ended.", 409);
    if (input.action === "resume") { if (row.actorId !== user.userId) throw new SchoolAiError("The original approver must resume this work.", 403); if (row.status === "BLOCKED") throw new SchoolAiError("Review new previews and create a new run for the remaining steps.", 409); await checkSteps(user, steps.slice(row.nextStep), row.campusId, db); await policy(user, row, steps, db); if (row.expiresAt <= new Date()) throw new SchoolAiError("The run has expired.", 409); }
    const updated = await db.schoolAiRun.update({ where: { id }, data: { status: input.action === "cancel" ? "CANCELLED" : input.action === "pause" ? "PAUSED" : "QUEUED", version: { increment: 1 }, ...(input.action === "cancel" ? { completedAt: new Date() } : {}) } }); await audit(user, updated, input.action.toUpperCase(), db); return output(updated);
  });
}

/** One step and its durable receipt commit together. The same lock serializes pause/cancel. */
export async function processSchoolRun(user: AuthUser, id: string) {
  try {
    return await schoolAiTransaction(user, async db => {
      await db.$queryRaw`SELECT id FROM school_ai_runs WHERE id=${id} AND school_id=${user.schoolId} FOR UPDATE`;
      const row = await db.schoolAiRun.findFirst({ where: { id, ...scope(user), actorId: user.userId, status: "QUEUED", scheduledAt: { lte: new Date() } } }); if (!row) return null;
      if (row.expiresAt <= new Date()) { const expired = await db.schoolAiRun.update({ where: { id }, data: { status: "EXPIRED", version: { increment: 1 }, completedAt: new Date() } }); await audit(user, expired, "EXPIRE", db); return output(expired); }
      await access(user, db); if (row.actorRole !== user.role || row.accessVersion !== (user.accessVersion ?? 0)) throw new SchoolAiError("The approving account changed.", 403, "ACCESS_CHANGED");
      const steps = runStepsSchema.parse(row.steps); await policy(user, row, steps, db); await checkSteps(user, steps.slice(row.nextStep), row.campusId, db);
      const step = steps[row.nextStep]; if (!step) throw new SchoolAiError("Invalid saved run.", 422, "INVALID_RUN");
      const receipt = await executeSchoolAiToolInTransaction(user, step.recordId, { operation: executionOperationSchema.parse(step.operation), version: step.version, previewHash: step.previewHash, idempotencyKey: `run-${id}-${row.nextStep}` }, db);
      const nextStep = row.nextStep + 1, completed = nextStep === steps.length;
      const updated = await db.schoolAiRun.update({ where: { id }, data: { nextStep, receipts: json([...(row.receipts as unknown as SchoolRun["receipts"]), { id: receipt.id, operation: receipt.operation, recordId: receipt.recordId, version: receipt.version }]), version: { increment: 1 }, status: completed ? "COMPLETED" : "QUEUED", ...(completed ? { completedAt: new Date() } : {}) } }); await audit(user, updated, "STEP_COMPLETED", db); return output(updated);
    });
  } catch (error) {
    // Domain failures need a fresh human preview; already committed steps remain visible.
    if (error instanceof ZodError || error instanceof Error && "status" in error && [400, 402, 403, 404, 409, 422].includes(Number(error.status))) await schoolAiTransaction(user, async db => { const row = await db.schoolAiRun.findFirst({ where: { id, schoolId: user.schoolId, actorId: user.userId, status: "QUEUED" } }); if (row) { const blocked = await db.schoolAiRun.update({ where: { id }, data: { status: "BLOCKED", version: { increment: 1 }, errorCode: error instanceof BillingAccessError && error.status === 402 ? "BILLING_REVIEW_REQUIRED" : error instanceof ZodError ? "INVALID_RUN" : error instanceof SchoolAiError ? error.code ?? "REVIEW_REQUIRED" : "REVIEW_REQUIRED" } }); await audit(user, blocked, "BLOCKED", db); } });
    throw error;
  }
}
export async function sweepSchoolRuns(db: PrismaClient, limit = 20) {
  const rows = await db.schoolAiRun.findMany({ where: { status: "QUEUED", scheduledAt: { lte: new Date() } }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], select: { id: true, schoolId: true, campusId: true, actorId: true, actorRole: true, accessVersion: true, version: true }, take: Math.max(1, Math.min(limit, 50)) });
  let processed = 0;
  for (const row of rows) {
    const person = await db.user.findFirst({ where: { id: row.actorId, schoolId: row.schoolId }, select: { id: true, email: true, role: true, campusId: true, accessVersion: true } });
    if (!person) { await db.schoolAiRun.updateMany({ where: { id: row.id, schoolId: row.schoolId, status: "QUEUED", version: row.version }, data: { status: "BLOCKED", errorCode: "ACCESS_CHANGED", version: { increment: 1 } } }); continue; }
    const user: AuthUser = { userId: person.id, schoolId: row.schoolId, role: row.actorRole as AuthUser["role"], campusId: row.actorRole === "SUPER_ADMIN" ? null : row.campusId, email: person.email, accessVersion: row.accessVersion };
    try { await processSchoolRun(user, row.id); processed++; } catch { /* Scoped durable state carries the reason; never log school contents. */ }
  }
  return { processed };
}
