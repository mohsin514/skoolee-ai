import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageCampusOps, scopedCampusWhere } from "@/lib/api/scope";
import { updateClassWithTeacherAssignmentTx } from "@/lib/api/teacher-assignments";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockTimetableCampus } from "@/lib/timetable/locking";

// SKAI-193: class and section edits captured offline ride the SKO-448 operation log (offline_operations). Each edit
// carries a stable operation id and the class's updatedAt it was based on. A repeated id returns its first outcome
// (no second write); a class changed since the base is a CONFLICT with the server value, never last-write-wins.
// Ids are unique per school, so another tenant's operations are neither found nor replayed. The changes feed is the
// reconnect cursor: the device asks only for classes changed after the last updatedAt it saw.

export type ClassEdit = { operationId: string; kind: "CLASS_EDIT"; classId: string; capturedAt: string; baseUpdatedAt: string; payload: { name?: string; section?: string | null; capacity?: number | null } };
type Outcome = { operationId: string; status: string; message?: string | null; server?: unknown; repeated?: boolean };
const FIELDS = ["name", "section", "capacity"] as const;
const MAX_AGE_DAYS = 3;

/** Shape check before anything is read or written; null means the edit can be tried. */
export function invalidClassEdit(op: Partial<ClassEdit> | null | undefined, now = Date.now()): string | null {
  if (!op || typeof op.operationId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(op.operationId) || op.kind !== "CLASS_EDIT" || !op.classId) return "This change is not a supported offline action.";
  const keys = Object.keys(op.payload ?? {});
  if (!keys.length || keys.some(k => !(FIELDS as readonly string[]).includes(k))) return "Only a class's name, section and capacity can be changed offline.";
  if (op.payload!.name !== undefined && !String(op.payload!.name).trim()) return "A class name is required";
  const captured = new Date(String(op.capturedAt)).getTime(), base = new Date(String(op.baseUpdatedAt)).getTime();
  if (Number.isNaN(captured) || Number.isNaN(base) || captured > now + 5 * 60_000) return "The capture time is not valid.";
  if (captured < now - MAX_AGE_DAYS * 86_400_000) return `Changes older than ${MAX_AGE_DAYS} days are not synced. Make the change again online.`;
  return null;
}

/** Stale when the server's version token is not the one the edit was based on. */
export const isStale = (baseUpdatedAt: string, current: Date | string) => new Date(baseUpdatedAt).getTime() !== new Date(current).getTime();

class Stale extends Error { constructor(readonly server: unknown) { super("stale"); } }
const view = (c: { id: string; name: string; section: string | null; capacity: number | null; updatedAt: Date; archivedAt?: Date | null }) => ({ id: c.id, name: c.name, section: c.section, capacity: c.capacity, updatedAt: c.updatedAt.toISOString(), archived: Boolean(c.archivedAt) });
const select = { id: true, name: true, section: true, capacity: true, updatedAt: true, archivedAt: true, campusId: true } as const;
const scope = (user: AuthUser) => ({ ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId), schoolId: user.schoolId });

type Db = Pick<typeof prisma, "offlineOperation">;
const opData = (user: AuthUser, deviceId: string, op: ClassEdit, status: string, extra: { message?: string | null; server?: unknown }) => ({ schoolId: user.schoolId, operationId: op.operationId, userId: user.userId, deviceId, kind: op.kind, classId: op.classId, date: "", studentId: "", capturedAt: new Date(op.capturedAt), baseStatus: op.baseUpdatedAt, payload: op.payload as Prisma.InputJsonValue, status, message: extra.message ?? null, serverValue: (extra.server ?? undefined) as Prisma.InputJsonValue | undefined });

/** Records an outcome. When `write` is given, the class edit and its log row commit together or not at all. */
async function record(user: AuthUser, deviceId: string, op: ClassEdit, status: string, extra: { message?: string | null; server?: unknown } = {}, write?: (log: (db: Db, server: unknown) => Promise<unknown>) => Promise<unknown>): Promise<Outcome> {
  try {
    if (write) extra.server = await write((db, server) => db.offlineOperation.create({ data: opData(user, deviceId, op, status, { ...extra, server }) }));
    else await prisma.offlineOperation.create({ data: opData(user, deviceId, op, status, extra) });
  } catch (error) {
    // Two replays racing: the first one recorded wins (the loser's class edit rolled back) and both get its outcome.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await prisma.offlineOperation.findFirstOrThrow({ where: { schoolId: user.schoolId, operationId: op.operationId } });
      return { operationId: op.operationId, status: prior.status, message: prior.message, server: prior.serverValue, repeated: true };
    }
    throw error;
  }
  return { operationId: op.operationId, status, message: extra.message ?? null, server: extra.server };
}

/** Applies one edit only if the class is still at the version it was based on (checked inside the campus fence). */
async function apply(user: AuthUser, classId: string, baseUpdatedAt: string, payload: ClassEdit["payload"], log: (db: Db, server: unknown) => Promise<unknown>) {
  const located = await prisma.class.findFirst({ where: { id: classId, ...scope(user) }, select });
  if (!located) throw new ApiError("Class not found", 404);
  return schoolAiTransaction(user, async tx => {
    await lockTimetableCampus(tx, user.schoolId, located.campusId);
    const now = await tx.class.findFirst({ where: { id: classId, schoolId: user.schoolId }, select });
    if (!now || isStale(baseUpdatedAt, now.updatedAt)) throw new Stale(now ? view(now) : null);
    const { cls } = await updateClassWithTeacherAssignmentTx(tx, user, { id: classId, ...payload }, located.campusId);
    await log(tx, view(cls));
    return view(cls);
  });
}

export async function syncClassEdits(user: AuthUser, body: Record<string, unknown>) {
  if (!canManageCampusOps(user)) throw new ApiError("Classes are set up by your campus admin.", 403);
  const deviceId = String(body.deviceId ?? "").slice(0, 80);
  if (deviceId.length < 8) throw new ApiError("Missing device id.", 400);
  const ops = (Array.isArray(body.operations) ? body.operations : []) as ClassEdit[];
  if (ops.length > 100) throw new ApiError("Send at most 100 changes at a time.", 400);
  const outcomes: Outcome[] = [];
  for (const op of [...ops].sort((a, b) => String(a?.capturedAt).localeCompare(String(b?.capturedAt)))) {
    const invalid = invalidClassEdit(op);
    if (invalid) { outcomes.push({ operationId: String(op?.operationId ?? ""), status: "INVALID", message: invalid }); continue; }
    const prior = await prisma.offlineOperation.findFirst({ where: { schoolId: user.schoolId, operationId: op.operationId } });
    if (prior) {
      if (prior.userId !== user.userId || prior.kind !== "CLASS_EDIT") { outcomes.push({ operationId: op.operationId, status: "INVALID", message: "This change belongs to another account." }); continue; }
      outcomes.push({ operationId: op.operationId, status: prior.status, message: prior.message, server: prior.serverValue, repeated: true }); continue;
    }
    try {
      outcomes.push(await record(user, deviceId, op, "ACCEPTED", {}, log => apply(user, op.classId, op.baseUpdatedAt, op.payload, log)));
    } catch (error) {
      if (error instanceof Stale) { outcomes.push(await record(user, deviceId, op, "CONFLICT", { message: "This class was changed after your edit was captured.", server: error.server })); continue; }
      if (!(error instanceof ApiError)) throw error;
      const access = error.status === 403 || error.status === 404;
      outcomes.push(await record(user, deviceId, op, access ? "REJECTED_ACCESS" : "INVALID", { message: access ? "This class is no longer available to you." : error.message }));
    }
  }
  return { outcomes, accepted: outcomes.filter(o => o.status === "ACCEPTED").length };
}

/** Keep the server's class, or apply yours over exactly the version you were shown (409 if it moved again). */
export async function resolveClassEdit(user: AuthUser, body: Record<string, unknown>) {
  if (!canManageCampusOps(user)) throw new ApiError("Classes are set up by your campus admin.", 403);
  const op = await prisma.offlineOperation.findFirst({ where: { schoolId: user.schoolId, userId: user.userId, kind: "CLASS_EDIT", operationId: String(body.operationId ?? "") } });
  if (!op) throw new ApiError("Change not found", 404);
  if (op.status !== "CONFLICT") throw new ApiError("This change has no open conflict.", 409);
  const mark = (db: Db, status: string, server: unknown) => db.offlineOperation.update({ where: { id: op.id }, data: { status, resolvedById: user.userId, resolvedAt: new Date(), serverValue: server as Prisma.InputJsonValue } });
  const seen = op.serverValue as { updatedAt?: string } | null;
  if (body.decision === "KEEP_SERVER") { await mark(prisma, "RESOLVED_SERVER", seen); return { operationId: op.operationId, status: "RESOLVED_SERVER", server: seen }; }
  if (body.decision !== "APPLY_LOCAL" || !seen?.updatedAt) throw new ApiError("Keep the server value or apply yours.", 400);
  try {
    const server = await apply(user, op.classId, seen.updatedAt, op.payload as ClassEdit["payload"], (db, value) => mark(db, "RESOLVED_LOCAL", value));
    return { operationId: op.operationId, status: "RESOLVED_LOCAL", server };
  } catch (error) {
    if (!(error instanceof Stale)) throw error;
    await prisma.offlineOperation.update({ where: { id: op.id }, data: { serverValue: error.server as Prisma.InputJsonValue } });
    throw new ApiError("The class changed again. Review the latest value.", 409);
  }
}

/** Reconnect cursor: classes in your scope changed after `cursor` (ISO updatedAt), oldest first. */
export async function classChanges(user: AuthUser, cursor: string | null) {
  if (!canManageCampusOps(user)) throw new ApiError("Classes are set up by your campus admin.", 403);
  const since = cursor ? new Date(cursor) : new Date(0);
  if (Number.isNaN(since.getTime())) throw new ApiError("Invalid cursor", 400);
  const rows = await prisma.class.findMany({ where: { ...scope(user), updatedAt: { gt: since } }, select, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 500 });
  return { items: rows.map(view), cursor: rows.length ? rows[rows.length - 1].updatedAt.toISOString() : cursor, more: rows.length === 500 };
}
