import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";

// ─── Data-subject requests (SKAI-1159, GCC matrix §3.6) ───────────
// Access, correction and deletion for one student or guardian. Every lookup is
// pinned to the administrator's school, so another school's record answers
// exactly like a missing one. Deletion follows the archive policy: students are
// archived and guardian links revoked; history is never hard-deleted.
const id = z.string().min(1).max(128);
const reason = z.string().trim().min(5).max(500);
const subject = z.enum(["STUDENT", "GUARDIAN"]);
const value = z.string().trim().max(500).nullable();

/** Fields an administrator may correct. Identity keys (email, admission number) stay with their own flows. */
export const CORRECTABLE_FIELDS = {
  STUDENT: ["fullName", "nameUr", "phone", "address", "city", "guardianName", "guardianPhone", "guardianEmail"],
  GUARDIAN: ["fullName", "phone", "relationship"],
} as const;
const required = new Set(["fullName", "relationship"]);

export const subjectRequestInputs = [
  z.object({ kind: z.literal("GUARDIAN_EXPORT"), guardianId: id, reason }).strict(),
  z.object({ kind: z.literal("CORRECTION"), subject, subjectId: id, changes: z.record(z.string(), value), reason }).strict(),
  z.object({ kind: z.literal("SUBJECT_DELETION"), subject, subjectId: id, reason }).strict(),
] as const;
export const SUBJECT_KINDS = ["GUARDIAN_EXPORT", "CORRECTION", "SUBJECT_DELETION"] as const;
type Input = z.infer<(typeof subjectRequestInputs)[number]>;
type Plan = { subject: "STUDENT" | "GUARDIAN"; subjectId: string; changes?: Record<string, { from: string | null; to: string | null }> };

const findStudent = (tx: TxClient, schoolId: string, studentId: string) =>
  tx.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true, campusId: true, archivedAt: true, studentUserId: true, fullName: true, nameUr: true, phone: true, address: true, city: true, guardianName: true, guardianPhone: true, guardianEmail: true } });
const findGuardian = (tx: TxClient, schoolId: string, relationshipId: string) =>
  tx.guardianRelationship.findFirst({ where: { id: relationshipId, schoolId }, select: { id: true, campusId: true, studentId: true, guardianUserId: true, email: true, status: true, fullName: true, phone: true, relationship: true } });

async function findSubject(tx: TxClient, schoolId: string, kind: "STUDENT" | "GUARDIAN", subjectId: string) {
  const row = kind === "STUDENT" ? await findStudent(tx, schoolId, subjectId) : await findGuardian(tx, schoolId, subjectId);
  if (!row) throw new ApiError(kind === "STUDENT" ? "Learner not found." : "Guardian not found.", 404);
  return row as Record<string, unknown> & { id: string; campusId: string };
}

/** Validates the request against current data and returns the row to store. */
export async function planSubjectRequest(tx: TxClient, user: AuthUser, input: Input): Promise<Prisma.DataLifecycleRequestUncheckedCreateInput> {
  const base = { schoolId: user.schoolId, kind: input.kind, reason: input.reason, requestedBy: user.userId };
  if (input.kind === "GUARDIAN_EXPORT") {
    const guardian = await findSubject(tx, user.schoolId, "GUARDIAN", input.guardianId);
    return { ...base, campusId: guardian.campusId, plan: { subject: "GUARDIAN", subjectId: guardian.id } };
  }
  const current = await findSubject(tx, user.schoolId, input.subject, input.subjectId);
  const studentId = input.subject === "STUDENT" ? current.id : String(current.studentId);
  if (input.kind === "SUBJECT_DELETION") {
    if (input.subject === "STUDENT" ? current.archivedAt : current.status === "REVOKED") throw new ApiError("This record is already archived.", 409);
    return { ...base, campusId: current.campusId, studentId, plan: { subject: input.subject, subjectId: current.id } };
  }
  const allowed: readonly string[] = CORRECTABLE_FIELDS[input.subject];
  const changes: NonNullable<Plan["changes"]> = {};
  for (const [field, raw] of Object.entries(input.changes)) {
    if (!allowed.includes(field)) throw new ApiError(`${field} cannot be corrected here.`, 400);
    const to = raw === "" ? null : raw;
    if (to === null && required.has(field)) throw new ApiError(`${field} cannot be empty.`, 400);
    const from = (current[field] as string | null) ?? null;
    if (from !== to) changes[field] = { from, to };
  }
  if (!Object.keys(changes).length) throw new ApiError("Nothing to correct: the values already match.", 400);
  return { ...base, campusId: current.campusId, studentId, plan: { subject: input.subject, subjectId: current.id, changes } };
}

async function guardianArtifact(tx: TxClient, schoolId: string, guardianId: string) {
  const guardian = await findGuardian(tx, schoolId, guardianId);
  if (!guardian) throw new ApiError("The guardian record no longer exists.", 409);
  // One person may hold links to several children; match the account, else the email, inside this school only.
  const links = await tx.guardianRelationship.findMany({ where: { schoolId, ...(guardian.guardianUserId ? { guardianUserId: guardian.guardianUserId } : { email: guardian.email }) },
    select: { id: true, fullName: true, email: true, phone: true, relationship: true, status: true, validFrom: true, validUntil: true, verifiedAt: true, createdAt: true, student: { select: { id: true, fullName: true } },
      accessVersions: { select: { permissions: true, effectiveFrom: true, effectiveUntil: true, reason: true }, orderBy: { effectiveFrom: "asc" } } }, orderBy: { createdAt: "asc" } });
  const account = guardian.guardianUserId ? await tx.user.findFirst({ where: { id: guardian.guardianUserId, schoolId }, select: { fullName: true, email: true, phone: true, role: true, createdAt: true } }) : null;
  return { artifact: { generatedAt: new Date().toISOString(), guardian: { fullName: guardian.fullName, email: guardian.email, phone: guardian.phone }, account, links } as unknown as Prisma.InputJsonValue,
    receipt: { sections: { guardian: true, account: !!account, links: true }, counts: { links: links.length } } };
}

/** Runs an approved request. Values are re-read here, never trusted from the stored plan. */
export async function executeSubjectRequest(tx: TxClient, user: AuthUser, request: { id: string; kind: string; reason: string; plan: Prisma.JsonValue }, now: Date) {
  const plan = request.plan as Plan;
  const log = (tableName: string, recordId: string, oldValue: Prisma.InputJsonValue, newValue: Prisma.InputJsonValue) =>
    tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: user.campusId, tableName, recordId, userId: user.userId, oldValue, newValue: { ...(newValue as object), dataSubjectRequestId: request.id } } });
  if (request.kind === "GUARDIAN_EXPORT") return { kind: "export" as const, ...(await guardianArtifact(tx, user.schoolId, plan.subjectId)) };

  const current = await findSubject(tx, user.schoolId, plan.subject, plan.subjectId).catch(() => { throw new ApiError("The record no longer exists.", 409); });
  const table = plan.subject === "STUDENT" ? "students" : "guardian_relationships";
  if (request.kind === "CORRECTION") {
    const changes = plan.changes ?? {};
    const stale = Object.entries(changes).some(([field, change]) => ((current[field] as string | null) ?? null) !== change.from);
    if (stale) throw new ApiError("The record changed since this correction was requested. Raise a new request.", 409);
    const data = Object.fromEntries(Object.entries(changes).map(([field, change]) => [field, change.to]));
    const where = { id: current.id, schoolId: user.schoolId };
    const updated = plan.subject === "STUDENT" ? await tx.student.updateMany({ where, data }) : await tx.guardianRelationship.updateMany({ where, data });
    if (updated.count !== 1) throw new ApiError("The record no longer exists.", 409);
    await log(table, current.id, Object.fromEntries(Object.entries(changes).map(([field, change]) => [field, change.from])), data);
    return { kind: "done" as const, receipt: { action: "CORRECTED", subject: plan.subject, fields: Object.keys(changes) } };
  }

  if (plan.subject === "STUDENT") {
    if (current.archivedAt) throw new ApiError("This learner is already archived.", 409);
    await tx.student.updateMany({ where: { id: current.id, schoolId: user.schoolId }, data: { status: "archived", archivedAt: now, archiveReason: `Data-subject deletion request: ${request.reason}` } });
    if (current.studentUserId) {
      await tx.user.updateMany({ where: { id: String(current.studentUserId), schoolId: user.schoolId, role: "STUDENT" }, data: { isActive: false, accessVersion: { increment: 1 } } });
      await tx.loginSession.updateMany({ where: { userId: String(current.studentUserId), isActive: true }, data: { isActive: false, logoutAt: now } });
    }
    await tx.studentTimelineEvent.create({ data: { studentId: current.id, kind: "ARCHIVED", title: "Archived on a data-subject deletion request", detail: JSON.stringify({ requestId: request.id }), actorId: user.userId } });
    await log(table, current.id, { status: "active", archivedAt: null }, { status: "archived", archivedAt: now.toISOString() });
  } else {
    if (current.status === "REVOKED") throw new ApiError("This guardian link is already revoked.", 409);
    await tx.guardianRelationship.updateMany({ where: { id: current.id, schoolId: user.schoolId }, data: { status: "REVOKED", validUntil: now } });
    await log(table, current.id, { status: String(current.status) }, { status: "REVOKED", validUntil: now.toISOString() });
  }
  return { kind: "done" as const, receipt: { action: plan.subject === "STUDENT" ? "ARCHIVED" : "REVOKED", subject: plan.subject, hardDeleted: false,
    note: "Archived under the history-preserving policy: academic, attendance and finance history is kept and leaves only through its retention schedule." } };
}
