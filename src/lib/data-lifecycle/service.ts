import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { isCampusOperator, isInstitutionAuthority } from "@/lib/auth/institution";
import { studentScope, publishedReportsWhere } from "@/lib/auth/policy";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { DATA_REGIONS, type DataRegion } from "@/config/data-regions";
import { buildProcessingInventory, planPlacement } from "./inventory";
import { executeSubjectRequest, planSubjectRequest, subjectRequestInputs, SUBJECT_KINDS } from "./subject-requests";

// ─── Retention categories ─────────────────────────────────────────
// Only categories whose expiry is safe and well defined are listed. Learner
// records themselves are not erased here; that is SKO-389 (safe deletion).
export const RETENTION_CATEGORIES = {
  NOTIFICATIONS: { label: "In-app notifications", minimumDays: 30, stores: ["notifications table", "notification inbox views"] },
  EXPIRED_SESSIONS: { label: "Expired sign-in sessions", minimumDays: 1, stores: ["login_sessions table", "session device list"] },
  AI_USAGE_LOGS: { label: "AI usage logs", minimumDays: 90, stores: ["ai_usage_logs table", "AI usage reports"] },
} as const;
export type RetentionCategory = keyof typeof RETENTION_CATEGORIES;
const categorySchema = z.enum(Object.keys(RETENTION_CATEGORIES) as [RetentionCategory, ...RetentionCategory[]]);
// Holds may also preserve audit events (SKO-476), which leave only through their own retention.
export const HOLD_CATEGORIES = ["AUDIT_LOG", ...Object.keys(RETENTION_CATEGORIES)] as [string, ...string[]];
const holdCategorySchema = z.enum(HOLD_CATEGORIES);
/** A hold counts until it is released or its expiry passes. */
export const activeHoldWhere = (schoolId: string, category: string, now: Date) => ({ schoolId, category, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });
const BACKUP_NOTE = "Deleted rows leave provider backups only when those backups expire under the provider retention window; backups are not edited.";
const EXPORT_LINK_HOURS = 24;

/** School- or group-level data administration: the institution authority (§7.3 G17). */
export function canAdministerDataLifecycle(user: AuthUser) {
  return isInstitutionAuthority(user);
}
/** Staff who may ask for a campus export: campus operators (PRINCIPAL no longer requests exports, G17). */
const canRequestCampusExport = (user: AuthUser) => isCampusOperator(user);
function assertAdmin(user: AuthUser) {
  if (!canAdministerDataLifecycle(user)) throw new ApiError("Data lifecycle administration permission is required.", 403);
}

type RecordRow = { id: string };
async function categoryRecords(tx: TxClient, category: RetentionCategory, schoolId: string, cutoff: Date): Promise<RecordRow[]> {
  const select = { id: true } as const;
  switch (category) {
    case "NOTIFICATIONS": return tx.notification.findMany({ where: { schoolId, createdAt: { lt: cutoff } }, select });
    case "EXPIRED_SESSIONS": return tx.loginSession.findMany({ where: { schoolId, expiresAt: { lt: cutoff } }, select });
    case "AI_USAGE_LOGS": return tx.aIUsageLog.findMany({ where: { schoolId, createdAt: { lt: cutoff } }, select });
  }
}
async function deleteRecords(tx: TxClient, category: RetentionCategory, schoolId: string, ids: string[]): Promise<number> {
  const where = { schoolId, id: { in: ids } };
  switch (category) {
    case "NOTIFICATIONS": return (await tx.notification.deleteMany({ where })).count;
    case "EXPIRED_SESSIONS": return (await tx.loginSession.deleteMany({ where })).count;
    case "AI_USAGE_LOGS": return (await tx.aIUsageLog.deleteMany({ where })).count;
  }
}

async function currentSchedule(tx: TxClient, schoolId: string, category: RetentionCategory) {
  return tx.dataRetentionSchedule.findFirst({ where: { schoolId, category }, orderBy: { version: "desc" } });
}

export interface RetentionPreview { category: RetentionCategory; scheduleVersion: number; retentionDays: number; cutoff: string; eligible: number; held: number; categoryHeld: boolean }

async function preview(tx: TxClient, schoolId: string, category: RetentionCategory, now: Date): Promise<RetentionPreview & { eligibleIds: string[] }> {
  const schedule = await currentSchedule(tx, schoolId, category);
  if (!schedule) throw new ApiError("Set a retention period for this category first.", 409);
  const cutoff = new Date(now.getTime() - schedule.retentionDays * 86_400_000);
  const [rows, holds] = await Promise.all([
    categoryRecords(tx, category, schoolId, cutoff),
    tx.dataLegalHold.findMany({ where: activeHoldWhere(schoolId, category, now), select: { recordId: true } }),
  ]);
  const categoryHeld = holds.some(hold => hold.recordId === null);
  const heldIds = new Set(holds.flatMap(hold => hold.recordId ? [hold.recordId] : []));
  const eligibleIds = categoryHeld ? [] : rows.filter(row => !heldIds.has(row.id)).map(row => row.id);
  return { category, scheduleVersion: schedule.version, retentionDays: schedule.retentionDays, cutoff: cutoff.toISOString(), eligible: eligibleIds.length, held: rows.length - eligibleIds.length, categoryHeld, eligibleIds };
}

async function audit(tx: TxClient, user: AuthUser, tableName: string, recordId: string, newValue: Prisma.InputJsonValue, oldValue?: Prisma.InputJsonValue) {
  await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: user.campusId, tableName, recordId, userId: user.userId, newValue, ...(oldValue ? { oldValue } : {}) } });
}

// ─── Schedules and holds ──────────────────────────────────────────
export const scheduleInput = z.object({ category: categorySchema, retentionDays: z.number().int().min(1).max(36500), expectedVersion: z.number().int().min(0) }).strict();
export async function setRetentionSchedule(user: AuthUser, raw: unknown) {
  assertAdmin(user);
  const input = scheduleInput.parse(raw);
  const minimum = RETENTION_CATEGORIES[input.category].minimumDays;
  if (input.retentionDays < minimum) throw new ApiError(`${RETENTION_CATEGORIES[input.category].label} must be kept at least ${minimum} days.`, 400);
  return schoolAiTransaction(user, async tx => {
    const current = await currentSchedule(tx, user.schoolId, input.category);
    if ((current?.version ?? 0) !== input.expectedVersion) throw new ApiError("The retention schedule changed. Review the current version.", 409);
    const created = await tx.dataRetentionSchedule.create({ data: { schoolId: user.schoolId, category: input.category, retentionDays: input.retentionDays, version: input.expectedVersion + 1, createdBy: user.userId } });
    await audit(tx, user, "data_retention_schedules", created.id, { status: "ACTIVE", version: created.version });
    return created;
  });
}

export const holdInput = z.object({ category: holdCategorySchema, recordId: z.string().min(1).max(128).optional(), reason: z.string().trim().min(5).max(500), expiresAt: z.string().datetime().optional() }).strict()
  .refine(value => value.category !== "AUDIT_LOG" || !!value.expiresAt, { message: "An audit hold needs an expiry date.", path: ["expiresAt"] });
export async function placeLegalHold(user: AuthUser, raw: unknown) {
  assertAdmin(user);
  const input = holdInput.parse(raw);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) throw new ApiError("Choose a future expiry for the hold.", 400);
  return schoolAiTransaction(user, async tx => {
    const hold = await tx.dataLegalHold.create({ data: { schoolId: user.schoolId, category: input.category, recordId: input.recordId ?? null, reason: input.reason, placedBy: user.userId, expiresAt } });
    await audit(tx, user, "data_legal_holds", hold.id, { status: "ACTIVE" });
    return hold;
  });
}

export const releaseInput = z.object({ holdId: z.string().min(1), reason: z.string().trim().min(5).max(500) }).strict();
export async function releaseLegalHold(user: AuthUser, raw: unknown) {
  assertAdmin(user);
  const input = releaseInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const released = await tx.dataLegalHold.updateMany({ where: { id: input.holdId, schoolId: user.schoolId, releasedAt: null }, data: { releasedAt: new Date(), releasedBy: user.userId, releaseReason: input.reason } });
    if (!released.count) throw new ApiError("This hold is not active.", 409);
    await audit(tx, user, "data_legal_holds", input.holdId, { status: "INACTIVE" }, { status: "ACTIVE" });
    return { holdId: input.holdId };
  });
}

export async function previewRetention(user: AuthUser, category: unknown, now = new Date()): Promise<RetentionPreview> {
  assertAdmin(user);
  const parsed = categorySchema.parse(category);
  return schoolAiTransaction(user, async tx => {
    const { eligibleIds: _ids, ...result } = await preview(tx, user.schoolId, parsed, now);
    return result;
  });
}

// ─── Requests ─────────────────────────────────────────────────────
export const requestInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("EXPORT"), studentId: z.string().min(1).max(128), reason: z.string().trim().min(5).max(500) }).strict(),
  z.object({ kind: z.literal("RETENTION_DELETION"), category: categorySchema, reason: z.string().trim().min(5).max(500) }).strict(),
  z.object({ kind: z.literal("MIGRATION"), targetRegion: z.enum(Object.keys(DATA_REGIONS) as [DataRegion, ...DataRegion[]]), reason: z.string().trim().min(5).max(500) }).strict(),
  ...subjectRequestInputs,
]);

export async function createLifecycleRequest(user: AuthUser, raw: unknown, env: Record<string, string | undefined> = process.env, now = new Date()) {
  const input = requestInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    if (input.kind === "EXPORT") {
      if (!canAdministerDataLifecycle(user) && !canRequestCampusExport(user) && user.role !== "PARENT") throw new ApiError("You cannot request a data export.", 403);
      // Existence and scope share one answer so an out-of-scope learner is indistinguishable from a missing one.
      const student = await tx.student.findFirst({ where: { AND: [{ id: input.studentId }, studentScope(user, "any")] }, select: { id: true, campusId: true } });
      if (!student) throw new ApiError("Learner not found.", 404);
      const request = await tx.dataLifecycleRequest.create({ data: { schoolId: user.schoolId, campusId: student.campusId, kind: "EXPORT", studentId: student.id, reason: input.reason, requestedBy: user.userId } });
      await audit(tx, user, "data_lifecycle_requests", request.id, { status: "REQUESTED" });
      return request;
    }
    assertAdmin(user);
    if (input.kind === "GUARDIAN_EXPORT" || input.kind === "CORRECTION" || input.kind === "SUBJECT_DELETION") {
      const request = await tx.dataLifecycleRequest.create({ data: await planSubjectRequest(tx, user, input) });
      await audit(tx, user, "data_lifecycle_requests", request.id, { status: "REQUESTED", kind: request.kind });
      return request;
    }
    if (input.kind === "RETENTION_DELETION") {
      const { eligibleIds: _ids, ...plan } = await preview(tx, user.schoolId, input.category, now);
      const request = await tx.dataLifecycleRequest.create({ data: { schoolId: user.schoolId, kind: "RETENTION_DELETION", category: input.category, reason: input.reason, requestedBy: user.userId, plan: plan as unknown as Prisma.InputJsonValue } });
      await audit(tx, user, "data_lifecycle_requests", request.id, { status: "REQUESTED" });
      return request;
    }
    const verifications = await tx.dataServiceVerification.findMany({ where: { expiresAt: { gt: now } } });
    const plan = planPlacement(buildProcessingInventory(env, verifications, now), input.targetRegion);
    const request = await tx.dataLifecycleRequest.create({ data: { schoolId: user.schoolId, kind: "MIGRATION", targetRegion: input.targetRegion, reason: input.reason, requestedBy: user.userId, status: plan.blocked ? "BLOCKED" : "REQUESTED", plan: plan as unknown as Prisma.InputJsonValue } });
    await audit(tx, user, "data_lifecycle_requests", request.id, { status: request.status });
    return request;
  });
}

/** The export is built from the requester's own current scope, never the reviewer's. */
async function buildExport(tx: TxClient, requester: AuthUser, studentId: string) {
  const scoped = (permission: Parameters<typeof studentScope>[1]) => tx.student.findFirst({ where: { AND: [{ id: studentId }, studentScope(requester, permission)] }, select: { id: true } });
  const student = await tx.student.findFirst({ where: { AND: [{ id: studentId }, studentScope(requester, "any")] }, select: { id: true, admissionNo: true, fullName: true, rollNo: true, gender: true, dateOfBirth: true, status: true } });
  if (!student) throw new ApiError("The requester no longer has access to this learner.", 409);
  const family = requester.role === "PARENT";
  const [learning, attendance, finances] = await Promise.all([scoped("learningRecords"), scoped("attendance"), scoped("finances")]);
  const [enrollments, attendanceRows, marks, invoices] = await Promise.all([
    learning ? tx.studentEnrollment.findMany({ where: { studentId }, select: { campusName: true, className: true, academicYear: true, rollNo: true, status: true, startDate: true, endDate: true }, orderBy: { startDate: "asc" } }) : [],
    attendance ? tx.attendance.findMany({ where: { studentId }, select: { date: true, status: true }, orderBy: { date: "asc" } }) : [],
    learning ? tx.mark.findMany({ where: { studentId, ...(family ? { exam: publishedReportsWhere.exam } : {}) }, select: { examId: true, subjectId: true, marksObtained: true, isAbsent: true } }) : [],
    finances ? tx.invoice.findMany({ where: { studentId }, select: { invoiceDate: true, dueDate: true, totalAmount: true, balanceDue: true, currency: true, status: true }, orderBy: { invoiceDate: "asc" } }) : [],
  ]);
  const sections = { learner: true, enrollments: !!learning, attendance: !!attendance, results: !!learning, finances: !!finances };
  return { artifact: { generatedAt: new Date().toISOString(), learner: student, enrollments, attendance: attendanceRows, results: marks, invoices } as unknown as Prisma.InputJsonValue,
    receipt: { sections, counts: { enrollments: enrollments.length, attendance: attendanceRows.length, results: marks.length, invoices: invoices.length } } };
}

export const reviewInput = z.object({ requestId: z.string().min(1), decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().min(3).max(500), version: z.number().int().min(1) }).strict();

export async function reviewLifecycleRequest(user: AuthUser, raw: unknown, now = new Date()) {
  assertAdmin(user);
  const input = reviewInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const request = await tx.dataLifecycleRequest.findFirst({ where: { id: input.requestId, schoolId: user.schoolId } });
    if (!request) throw new ApiError("Request not found.", 404);
    if (request.requestedBy === user.userId) throw new ApiError("A different administrator must review this request.", 403);
    if (request.version !== input.version || request.status !== "REQUESTED") throw new ApiError("This request changed or was already decided.", 409);
    const decided = { reviewedBy: user.userId, reviewedAt: now, reviewNote: input.note, version: request.version + 1 };
    if (input.decision === "REJECT") {
      const rejected = await tx.dataLifecycleRequest.update({ where: { id: request.id }, data: { ...decided, status: "REJECTED" } });
      await audit(tx, user, "data_lifecycle_requests", request.id, { status: "REJECTED" }, { status: "REQUESTED" });
      return rejected;
    }
    let data: Prisma.DataLifecycleRequestUpdateInput;
    if (request.kind === "EXPORT") {
      const requester = await tx.user.findFirst({ where: { id: request.requestedBy, schoolId: user.schoolId, isActive: true }, select: { id: true, role: true, campusId: true, email: true, isInstitutionOwner: true } });
      if (!requester) throw new ApiError("The requester's account is no longer active.", 409);
      const requesterUser = { ...user, userId: requester.id, role: requester.role, campusId: requester.campusId, email: requester.email, isInstitutionOwner: requester.isInstitutionOwner } as AuthUser;
      const { artifact, receipt } = await buildExport(tx, requesterUser, request.studentId!);
      data = { ...decided, status: "COMPLETED", completedAt: now, artifact, receipt, downloadToken: randomBytes(32).toString("hex"), downloadExpiresAt: new Date(now.getTime() + EXPORT_LINK_HOURS * 3_600_000) };
    } else if (request.kind === "RETENTION_DELETION") {
      const category = categorySchema.parse(request.category);
      // Holds and eligibility are re-checked at execution, not taken from the approved preview.
      const current = await preview(tx, user.schoolId, category, now);
      const deleted = current.eligibleIds.length ? await deleteRecords(tx, category, user.schoolId, current.eligibleIds) : 0;
      data = { ...decided, status: "COMPLETED", completedAt: now, receipt: { category, scheduleVersion: current.scheduleVersion, cutoff: current.cutoff, deleted, held: current.held, categoryHeld: current.categoryHeld, stores: [...RETENTION_CATEGORIES[category].stores], backups: BACKUP_NOTE } };
    } else if ((SUBJECT_KINDS as readonly string[]).includes(request.kind)) {
      const outcome = await executeSubjectRequest(tx, user, request, now);
      data = outcome.kind === "export"
        ? { ...decided, status: "COMPLETED", completedAt: now, artifact: outcome.artifact, receipt: outcome.receipt, downloadToken: randomBytes(32).toString("hex"), downloadExpiresAt: new Date(now.getTime() + EXPORT_LINK_HOURS * 3_600_000) }
        : { ...decided, status: "COMPLETED", completedAt: now, receipt: outcome.receipt };
    } else {
      data = { ...decided, status: "APPROVED", receipt: { note: "Approved plan awaits platform execution and reconciliation; no data has moved." } };
    }
    const updated = await tx.dataLifecycleRequest.update({ where: { id: request.id }, data });
    await audit(tx, user, "data_lifecycle_requests", request.id, { status: updated.status }, { status: "REQUESTED" });
    return updated;
  });
}

/** Restricted delivery: only the requester, only with the token, only before expiry, only with current access. */
export async function downloadExport(user: AuthUser, requestId: string, token: string, now = new Date()) {
  return schoolAiTransaction(user, async tx => {
    const request = await tx.dataLifecycleRequest.findFirst({ where: { id: requestId, schoolId: user.schoolId, kind: { in: ["EXPORT", "GUARDIAN_EXPORT"] }, status: "COMPLETED", requestedBy: user.userId } });
    if (!request || !request.downloadToken || request.downloadToken !== token) throw new ApiError("Export not found.", 404);
    if (!request.downloadExpiresAt || request.downloadExpiresAt <= now) throw new ApiError("This export link has expired. Request a new export.", 410);
    const stillInScope = request.kind === "GUARDIAN_EXPORT" ? canAdministerDataLifecycle(user) : await tx.student.findFirst({ where: { AND: [{ id: request.studentId! }, studentScope(user, "any")] }, select: { id: true } });
    if (!stillInScope) throw new ApiError("Export not found.", 404);
    await audit(tx, user, "data_lifecycle_requests", request.id, { status: "COMPLETED", decision: "DOWNLOADED" });
    return request.artifact;
  });
}

// ─── Overview ─────────────────────────────────────────────────────
export async function lifecycleOverview(user: AuthUser, env: Record<string, string | undefined> = process.env, now = new Date()) {
  const admin = canAdministerDataLifecycle(user);
  if (!admin && !canRequestCampusExport(user) && user.role !== "PARENT") throw new ApiError("Data lifecycle information is not available for your role.", 403);
  return schoolAiTransaction(user, async tx => {
    const requestWhere: Prisma.DataLifecycleRequestWhereInput = admin ? { schoolId: user.schoolId }
      : canRequestCampusExport(user) ? { schoolId: user.schoolId, campusId: user.campusId, kind: "EXPORT" } : { schoolId: user.schoolId, requestedBy: user.userId };
    const requests = await tx.dataLifecycleRequest.findMany({ where: requestWhere, orderBy: { requestedAt: "desc" }, take: 50,
      select: { id: true, kind: true, status: true, category: true, studentId: true, targetRegion: true, reason: true, requestedBy: true, requestedAt: true, reviewedBy: true, reviewedAt: true, version: true, plan: true, receipt: true, downloadExpiresAt: true, downloadToken: true } });
    const visibleRequests = requests.map(({ downloadToken, ...request }) => ({ ...request, downloadToken: request.requestedBy === user.userId ? downloadToken : null }));
    // Guardians choose among their own verified children; staff enter a learner reference.
    const learners = user.role === "PARENT" ? await tx.student.findMany({ where: studentScope(user, "any"), select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 20 }) : [];
    if (!admin) return { admin, inventory: null, schedules: [], holds: [], requests: visibleRequests, learners, categories: RETENTION_CATEGORIES, holdCategories: HOLD_CATEGORIES, regions: DATA_REGIONS };
    const [verifications, schedules, holds] = await Promise.all([
      tx.dataServiceVerification.findMany({ where: { expiresAt: { gt: now } } }),
      tx.dataRetentionSchedule.findMany({ where: { schoolId: user.schoolId }, orderBy: [{ category: "asc" }, { version: "desc" }] }),
      tx.dataLegalHold.findMany({ where: { schoolId: user.schoolId, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { placedAt: "desc" } }),
    ]);
    const latest = Object.values(Object.fromEntries(schedules.reverse().map(row => [row.category, row])));
    return { admin, inventory: buildProcessingInventory(env, verifications, now), schedules: latest, holds, requests: visibleRequests, learners, categories: RETENTION_CATEGORIES, holdCategories: HOLD_CATEGORIES, regions: DATA_REGIONS };
  });
}

