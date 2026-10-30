import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { registerView, saveRegister } from "@/lib/attendance/register";
import { schoolToday } from "@/lib/datetime";

// SKO-448: conflict-aware offline capture, deliberately narrow — marking attendance only. Submitting a register,
// corrections with reasons, grades, fees, pickup and assignment publishing stay online.
// - "Prepare" gives a small snapshot of one class register (names, roll numbers, current marks and their versions)
//   that the device keeps for a bounded time under the signed-in account.
// - Each mark captured offline carries a stable operation id, the time it was captured and the version it was based
//   on. Sync is per operation and idempotent: an operation id already seen returns its first outcome.
// - Sync runs as the current session: permissions and class assignment are checked again, so revoked access is
//   refused (and kept for an authorised reviewer). A newer server value is a conflict shown beside the local one;
//   nothing is overwritten by "last write wins". Both observations stay in the operation record.

export const CAPABILITIES = {
  offline: ["Mark attendance for a class you prepared on this device"],
  onlineOnly: ["Submit the register", "Corrections to a submitted register", "Review family explanations", "Grades and report cards", "Fees and payments", "Pickup", "Assignments"],
};
const SNAPSHOT_HOURS = 12, MAX_AGE_DAYS = 3;
const STATUSES = ["PRESENT", "ABSENT", "LATE", "LEAVE", "EXCUSED", "PARTIAL"];

export async function prepare(user: AuthUser, classId: string, date: string) {
  const view = await registerView(user, classId, date);
  return {
    owner: { userId: user.userId, schoolId: user.schoolId }, class: view.class, date: view.date, registerStatus: view.register.status,
    preparedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + SNAPSHOT_HOURS * 3_600_000).toISOString(),
    entries: view.entries.map(e => ({ studentId: e.studentId, name: e.name, rollNo: e.rollNo, status: e.status, arrivalTime: e.arrivalTime, version: e.version })),
    capabilities: CAPABILITIES,
  };
}

type Op = { operationId: string; kind: string; classId: string; date: string; studentId: string; capturedAt: string; base: { status: string | null; version: number }; payload: { status: string; arrivalTime?: string | null; departureTime?: string | null } };
type Outcome = { operationId: string; status: string; message?: string | null; server?: unknown; repeated?: boolean };

async function current(user: AuthUser, studentId: string, date: string) {
  const row = await prisma.attendance.findFirst({ where: { schoolId: user.schoolId, studentId, date: new Date(`${date}T00:00:00.000Z`) }, include: { marker: { select: { fullName: true } } } });
  return row ? { id: row.id, status: row.status, arrivalTime: row.arrivalTime, version: row.version, markedBy: row.marker?.fullName ?? null, markedAt: row.markedAt } : null;
}

async function record(user: AuthUser, deviceId: string, op: Op, status: string, extra: { message?: string | null; serverValue?: unknown; attendanceId?: string | null } = {}): Promise<Outcome> {
  try {
    await prisma.offlineOperation.create({ data: { schoolId: user.schoolId, operationId: op.operationId, userId: user.userId, deviceId, kind: op.kind, classId: op.classId, date: op.date, studentId: op.studentId, capturedAt: new Date(op.capturedAt), baseStatus: op.base?.status ?? null, baseVersion: op.base?.version ?? null, payload: op.payload as Prisma.InputJsonValue, status, message: extra.message ?? null, serverValue: (extra.serverValue ?? undefined) as Prisma.InputJsonValue | undefined, attendanceId: extra.attendanceId ?? null } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await prisma.offlineOperation.findFirstOrThrow({ where: { schoolId: user.schoolId, operationId: op.operationId } });
      return { operationId: op.operationId, status: prior.status, message: prior.message, server: prior.serverValue, repeated: true };
    }
    throw error;
  }
  return { operationId: op.operationId, status, message: extra.message ?? null, server: extra.serverValue };
}

/** Applies queued operations in capture order. Each is decided once; a repeat returns its first decision. */
export async function sync(user: AuthUser, body: Record<string, unknown>) {
  const deviceId = String(body.deviceId ?? "").slice(0, 80);
  if (deviceId.length < 8) throw new ApiError("Missing device id.", 400);
  const ops = (Array.isArray(body.operations) ? body.operations : []) as Op[];
  if (ops.length > 300) throw new ApiError("Send at most 300 changes at a time.", 400);
  const outcomes: Outcome[] = [];
  for (const op of [...ops].sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)))) {
    if (!op?.operationId || op.kind !== "ATTENDANCE_MARK" || !op.classId || !/^\d{4}-\d{2}-\d{2}$/.test(op.date) || !op.studentId || !STATUSES.includes(op.payload?.status)) { outcomes.push({ operationId: String(op?.operationId ?? ""), status: "INVALID", message: "This change is not a supported offline action." }); continue; }
    const prior = await prisma.offlineOperation.findFirst({ where: { schoolId: user.schoolId, operationId: op.operationId } });
    if (prior) {
      // The same operation from another account is never revealed or applied.
      if (prior.userId !== user.userId) { outcomes.push({ operationId: op.operationId, status: "INVALID", message: "This change belongs to another account." }); continue; }
      outcomes.push({ operationId: op.operationId, status: prior.status, message: prior.message, server: prior.serverValue, repeated: true }); continue;
    }
    const captured = new Date(op.capturedAt);
    if (Number.isNaN(captured.getTime()) || captured.getTime() > Date.now() + 5 * 60_000) { outcomes.push(await record(user, deviceId, op, "EXPIRED", { message: "The capture time is not valid." })); continue; }
    if (captured.getTime() < Date.now() - MAX_AGE_DAYS * 86_400_000) { outcomes.push(await record(user, deviceId, op, "EXPIRED", { message: `Changes older than ${MAX_AGE_DAYS} days are not synced. Mark the register again online.` })); continue; }
    if (op.date > await schoolToday(user.schoolId, user.campusId)) { outcomes.push(await record(user, deviceId, op, "EXPIRED", { message: "Attendance cannot be recorded for a future day." })); continue; }
    const now = await current(user, op.studentId, op.date);
    if ((now?.version ?? 0) !== (op.base?.version ?? 0)) { outcomes.push(await record(user, deviceId, op, "CONFLICT", { message: "A newer entry was recorded after this was captured.", serverValue: now, attendanceId: now?.id })); continue; }
    try {
      const r = await saveRegister(user, { classId: op.classId, date: op.date, entries: [{ studentId: op.studentId, status: op.payload.status, knownStatus: now?.status ?? null, arrivalTime: op.payload.arrivalTime ?? null, departureTime: op.payload.departureTime ?? null }] });
      if (r.conflicts.length) { outcomes.push(await record(user, deviceId, op, "CONFLICT", { message: "A newer entry was recorded after this was captured.", serverValue: await current(user, op.studentId, op.date) })); continue; }
      const after = await current(user, op.studentId, op.date);
      outcomes.push(await record(user, deviceId, op, "ACCEPTED", { serverValue: after, attendanceId: after?.id }));
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      const access = error.status === 403 || error.status === 404;
      outcomes.push(await record(user, deviceId, op, access ? "REJECTED_ACCESS" : "CONFLICT", { message: access ? "Your access to this class changed. An authorised reviewer can decide this change." : error.message, serverValue: now }));
    }
  }
  return { outcomes, accepted: outcomes.filter(o => o.status === "ACCEPTED").length };
}

/** The person who captured a conflict decides it: keep the server value, apply theirs over it, or ask for a correction. */
export async function resolve(user: AuthUser, body: Record<string, unknown>) {
  const op = await prisma.offlineOperation.findFirst({ where: { schoolId: user.schoolId, operationId: String(body.operationId ?? ""), userId: user.userId } });
  if (!op) throw new ApiError("Change not found", 404);
  if (op.status !== "CONFLICT") throw new ApiError("This change has no open conflict.", 409);
  const decision = String(body.decision ?? "");
  if (decision === "KEEP_SERVER" || decision === "REQUEST_CORRECTION") {
    await prisma.offlineOperation.update({ where: { id: op.id }, data: { status: decision === "KEEP_SERVER" ? "RESOLVED_SERVER" : "CORRECTION_REQUESTED", resolvedById: user.userId, resolvedAt: new Date(), message: decision === "REQUEST_CORRECTION" ? `Correction requested: ${String(body.note ?? "").slice(0, 300)}` : op.message } });
    return { operationId: op.operationId, status: decision === "KEEP_SERVER" ? "RESOLVED_SERVER" : "CORRECTION_REQUESTED" };
  }
  if (decision !== "APPLY_LOCAL") throw new ApiError("Keep the server value, apply yours, or request a correction.", 400);
  // Applying over the server value is allowed only against the exact entry that was shown.
  const seen = op.serverValue as { version?: number; status?: string } | null;
  const now = await current(user, op.studentId, op.date);
  if ((now?.version ?? 0) !== (seen?.version ?? 0)) throw new ApiError("The entry changed again. Review the latest value.", 409);
  const payload = op.payload as { status: string; arrivalTime?: string | null; departureTime?: string | null };
  const r = await saveRegister(user, { classId: op.classId, date: op.date, reason: body.reason ? String(body.reason) : undefined, entries: [{ studentId: op.studentId, status: payload.status, knownStatus: now?.status ?? null, arrivalTime: payload.arrivalTime ?? null, departureTime: payload.departureTime ?? null }] });
  if (r.conflicts.length) throw new ApiError("The entry changed again. Review the latest value.", 409);
  await prisma.offlineOperation.update({ where: { id: op.id }, data: { status: "RESOLVED_LOCAL", resolvedById: user.userId, resolvedAt: new Date(), attendanceId: now?.id ?? op.attendanceId } });
  return { operationId: op.operationId, status: "RESOLVED_LOCAL" };
}

/** Changes refused because access changed wait here for a campus leader; nothing in them is applied by itself. */
export async function reviewQueue(user: AuthUser) {
  if (!canManageOperations(user)) throw new ApiError("Only campus leaders review these changes.", 403);
  const rows = await prisma.offlineOperation.findMany({ where: { schoolId: user.schoolId, status: "REJECTED_ACCESS" }, orderBy: { capturedAt: "asc" }, take: 200 });
  const people = new Map((await prisma.user.findMany({ where: { schoolId: user.schoolId, id: { in: rows.map(r => r.userId) } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName]));
  const pupils = new Map((await prisma.student.findMany({ where: { schoolId: user.schoolId, id: { in: rows.map(r => r.studentId) } }, select: { id: true, fullName: true } })).map(s => [s.id, s.fullName]));
  return rows.map(r => ({ operationId: r.operationId, capturedBy: people.get(r.userId) ?? "", pupil: pupils.get(r.studentId) ?? "", classId: r.classId, date: r.date, capturedAt: r.capturedAt, payload: r.payload, server: r.serverValue }));
}

export async function reviewDecide(user: AuthUser, body: Record<string, unknown>) {
  if (!canManageOperations(user)) throw new ApiError("Only campus leaders review these changes.", 403);
  const op = await prisma.offlineOperation.findFirst({ where: { schoolId: user.schoolId, operationId: String(body.operationId ?? ""), status: "REJECTED_ACCESS" } });
  if (!op) throw new ApiError("Change not found", 404);
  if (body.decision === "DISCARD") {
    await prisma.offlineOperation.update({ where: { id: op.id }, data: { status: "DISCARDED", resolvedById: user.userId, resolvedAt: new Date() } });
    return { operationId: op.operationId, status: "DISCARDED" };
  }
  if (body.decision !== "APPLY") throw new ApiError("Apply or discard.", 400);
  const now = await current(user, op.studentId, op.date);
  if ((now?.version ?? 0) !== (op.baseVersion ?? 0)) throw new ApiError("The entry changed since this was captured; mark it again in the register.", 409);
  const payload = op.payload as { status: string; arrivalTime?: string | null; departureTime?: string | null };
  const r = await saveRegister(user, { classId: op.classId, date: op.date, entries: [{ studentId: op.studentId, status: payload.status, knownStatus: now?.status ?? null, arrivalTime: payload.arrivalTime ?? null, departureTime: payload.departureTime ?? null }] });
  if (r.conflicts.length) throw new ApiError("The entry changed since this was captured; mark it again in the register.", 409);
  await prisma.offlineOperation.update({ where: { id: op.id }, data: { status: "RESOLVED_LOCAL", resolvedById: user.userId, resolvedAt: new Date() } });
  return { operationId: op.operationId, status: "RESOLVED_LOCAL" };
}
