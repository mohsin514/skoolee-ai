import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, canManageCampusOps } from "@/lib/api/scope";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { getLocalePackage } from "@/lib/locale/store";
import { localToInstant } from "@/lib/assignments/rules";
import { resolveSourceActions } from "@/lib/notifications/actions";
import { deliverNotification } from "@/lib/notifications/in-app";

// SKO-465: the reception call log. A call is recorded once and never edited or deleted. A promised
// callback is an owned task: it stays open through unsuccessful attempts and reschedules until an
// outcome is recorded, and a further obligation is a new callback linked to the one it came from.
// Notes can be marked sensitive; those are shown only to campus leaders, whoever logged the call and
// the callback owners — never in lists for anyone else or in dashboard summaries.

// role-ux G40 / C29: the front desk and the campus admins own front-office work. The principal (academic) and the
// super admin (governance) are never owners, and ADMIN — the campus operator of a single school — is.
export const OWNER_ROLES = ["CAMPUS_ADMIN", "ADMIN", "RECEPTIONIST"];
const PHONE = /^\+?[\d\s()-]{6,30}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isLeader = (user: AuthUser) => canManageCampusOps(user);

/**
 * People who may own front-office work on this campus (G40, F13): its campus admins (CAMPUS_ADMIN, and ADMIN — the
 * operator of a single school) and receptionists. Served with the call and post lists so the owner pickers never
 * depend on the routes' older `?owners=1` query (which still lists the principal and omits ADMIN). Front-desk staff
 * only; everyone else gets an empty list.
 */
export async function ownerCandidates(user: AuthUser, campusId: string, db: Pick<TxClient, "user"> = prisma) {
  if (!(canManageCampusOps(user) || user.role === "RECEPTIONIST")) return [];
  return db.user.findMany({ where: { schoolId: user.schoolId, campusId, isActive: true, role: { in: OWNER_ROLES as never[] } }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } });
}
/** Front-desk staff: the receptionist and the campus admins (never the principal). */
const isFrontDesk = (user: AuthUser) => canManageCampusOps(user) || user.role === "RECEPTIONIST";
export const digits = (phone: string) => phone.replace(/\D/g, "");

const text = (value: unknown, label: string, min: number, max: number) => {
  const out = String(value ?? "").trim();
  if (out.length < min) throw new ApiError(min > 1 ? `${label} needs at least ${min} characters.` : `${label} is required.`, 400);
  if (out.length > max) throw new ApiError(`${label} is too long (max ${max}).`, 400);
  return out;
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function timezoneFor(user: AuthUser, campusId: string, db: TxClient) {
  return (await getLocalePackage(user.schoolId, campusId, new Date(), null, db)).timezone;
}
/** A school-local "YYYY-MM-DDTHH:mm" (or a bare date, read as 09:00) as an instant. */
function instant(value: unknown, label: string, timezone: string) {
  const raw = String(value ?? "").trim();
  const local = DAY.test(raw) ? `${raw}T09:00` : raw;
  try { return localToInstant(local, timezone); }
  catch (failure) { throw new ApiError(`${label}: ${failure instanceof Error ? failure.message : "enter a date and time."}`, 400); }
}

async function validOwner(db: TxClient, user: AuthUser, campusId: string, ownerId: string) {
  const owner = await db.user.findFirst({ where: { id: ownerId, schoolId: user.schoolId, isActive: true, role: { in: OWNER_ROLES as never[] }, campusId }, select: { id: true } });
  if (!owner) throw new ApiError("Choose an active front-desk or leadership colleague in this campus as the owner.", 400);
}

/** Whether this person may read a call's note. */
export function canReadNote(user: AuthUser, call: { sensitive: boolean; recordedById: string | null }, ownerIds: (string | null)[]) {
  if (!isFrontDesk(user) && !ownerIds.includes(user.userId)) return false;
  return !call.sensitive || isLeader(user) || call.recordedById === user.userId || ownerIds.includes(user.userId);
}

type Assignment = { callbackId: string; ownerId: string; dueAt: Date; callerName: string; campusId: string };
/** One ACTION notification per callback and owner; a repeat bumps the same row (SKO-416). */
async function notifyOwner(user: AuthUser, assignment: Assignment) {
  if (assignment.ownerId === user.userId) return;
  await deliverNotification("PHONE_CALLBACK_ASSIGNED", { schoolId: user.schoolId, campusId: assignment.campusId, actorId: user.userId, actorName: user.fullName ?? null, ownerId: assignment.ownerId, callbackId: assignment.callbackId, callerName: assignment.callerName, dueAt: assignment.dueAt.toISOString() })
    .catch(error => console.error("[phone-calls] owner notification failed", error));
}

export async function logCall(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  const key = body.idempotencyKey ? String(body.idempotencyKey) : null;
  if (key && !/^[A-Za-z0-9-]{8,80}$/.test(key)) throw new ApiError("Invalid idempotency key", 400);
  const result = await schoolAiTransaction(user, async db => {
    const timezone = await timezoneFor(user, campusId, db);
    const input = {
      name: text(body.name, "Caller name", 2, 120),
      phone: text(body.phone, "Phone", 6, 30),
      direction: String(body.direction ?? ""),
      date: instant(body.date, "Call time", timezone),
      purpose: text(body.purpose, "Purpose", 2, 120),
      note: String(body.note ?? "").trim() || null,
      sensitive: body.sensitive === true,
    };
    if (!PHONE.test(input.phone)) throw new ApiError("Enter a valid phone number (digits, spaces, + ( ) -).", 400);
    if (!["IN", "OUT"].includes(input.direction)) throw new ApiError("Direction must be incoming or outgoing.", 400);
    if (input.note && input.note.length > 1000) throw new ApiError("Note is too long (max 1000).", 400);
    if (input.date.getTime() > Date.now() + 5 * 60_000) throw new ApiError("The call time cannot be in the future.", 400);
    const callback = body.callbackDue ? { dueAt: instant(body.callbackDue, "Callback due", timezone), ownerId: body.callbackOwnerId ? String(body.callbackOwnerId) : null } : null;
    if (callback && callback.dueAt < input.date) throw new ApiError("The callback cannot be due before the call.", 400);
    const requestHash = hash({ ...input, date: input.date.toISOString(), callback: callback && { ...callback, dueAt: callback.dueAt.toISOString() } });

    if (key) {
      const previous = await db.phoneCallLog.findUnique({ where: { campusId_idempotencyKey: { campusId, idempotencyKey: key } } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ApiError("This retry does not match the call you first saved. Start a new entry instead.", 409);
        return { call: previous, replayed: true, assignment: null };
      }
    }
    if (callback?.ownerId) await validOwner(db, user, campusId, callback.ownerId);
    const call = await db.phoneCallLog.create({ data: { schoolId: user.schoolId, campusId, ...input, phoneDigits: digits(input.phone), recordedById: user.userId, idempotencyKey: key, requestHash: key ? requestHash : null } });
    let assignment: Assignment | null = null;
    if (callback) {
      const created = await db.phoneCallback.create({ data: { schoolId: user.schoolId, campusId, callId: call.id, ownerId: callback.ownerId, dueAt: callback.dueAt, createdById: user.userId } });
      await db.phoneCallbackEvent.create({ data: { schoolId: user.schoolId, campusId, callbackId: created.id, kind: "CREATED", ownerId: callback.ownerId, dueAt: callback.dueAt, actorId: user.userId } });
      if (callback.ownerId) assignment = { callbackId: created.id, ownerId: callback.ownerId, dueAt: callback.dueAt, callerName: call.name, campusId };
    }
    return { call, replayed: false, assignment };
  });
  if (result.assignment) await notifyOwner(user, result.assignment);
  return result;
}

/** One action per call on an open callback, checked against the version the person was looking at. */
export async function actOnCallback(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  const action = String(body.action ?? "");
  const outcome = await schoolAiTransaction(user, async db => {
    const id = String(body.id ?? "");
    const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM phone_callbacks WHERE id = ${id} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
    const callback = locked ? await db.phoneCallback.findUnique({ where: { id }, include: { call: { select: { name: true } } } }) : null;
    // A callback the person may not act on answers exactly like one that does not exist.
    if (!callback || !(isFrontDesk(user) || callback.ownerId === user.userId)) throw new ApiError("Callback not found", 404);
    if (body.version !== undefined && Number(body.version) !== callback.version) throw new ApiError("This callback changed since you opened it. Reload to see the latest before saving.", 409);
    if (callback.status !== "OPEN") throw new ApiError("This callback is already completed. Its history is kept.", 409);
    const event = { schoolId: user.schoolId, campusId, callbackId: id, actorId: user.userId };
    const bump = { version: { increment: 1 } };
    const timezone = await timezoneFor(user, campusId, db);
    const note = body.note ? text(body.note, "Note", 2, 1000) : null;

    if (action === "reassign") {
      if (!isFrontDesk(user)) throw new ApiError("Only front-desk staff and campus leaders can reassign a callback.", 403);
      const ownerId = body.ownerId ? String(body.ownerId) : null;
      if (ownerId === callback.ownerId) throw new ApiError("This callback already has that owner.", 409);
      if (ownerId) await validOwner(db, user, campusId, ownerId);
      // The due time is unchanged: reassigning does not restart the clock.
      const updated = await db.phoneCallback.update({ where: { id }, data: { ownerId, ...bump } });
      await db.phoneCallbackEvent.create({ data: { ...event, kind: "REASSIGNED", ownerId, note } });
      await resolveSourceActions({ schoolId: user.schoolId, sourceType: "callback", sourceId: id, resolution: "REASSIGNED", exceptUserIds: ownerId ? [ownerId] : [] }, db);
      return { updated, assignment: ownerId ? { callbackId: id, ownerId, dueAt: callback.dueAt, callerName: callback.call.name, campusId } : null };
    }
    if (action === "reschedule") {
      const dueAt = instant(body.dueAt, "New due time", timezone);
      const updated = await db.phoneCallback.update({ where: { id }, data: { dueAt, ...bump } });
      await db.phoneCallbackEvent.create({ data: { ...event, kind: "RESCHEDULED", dueAt, note } });
      return { updated, assignment: null };
    }
    if (action === "attempt") {
      // An unanswered attempt keeps the callback open; it can move the due time at the same moment.
      const attemptNote = text(body.note, "What happened on this attempt", 2, 1000);
      const dueAt = body.dueAt ? instant(body.dueAt, "Next attempt", timezone) : null;
      const updated = await db.phoneCallback.update({ where: { id }, data: { attempts: { increment: 1 }, ...(dueAt ? { dueAt } : {}), ...bump } });
      await db.phoneCallbackEvent.create({ data: { ...event, kind: "ATTEMPTED", dueAt, note: attemptNote } });
      return { updated, assignment: null };
    }
    if (action === "complete") {
      const result = text(body.outcome, "Outcome", 5, 1000);
      const updated = await db.phoneCallback.update({ where: { id }, data: { status: "DONE", outcome: result, completedAt: new Date(), completedById: user.userId, ...bump } });
      await db.phoneCallbackEvent.create({ data: { ...event, kind: "COMPLETED", note: result } });
      await resolveSourceActions({ schoolId: user.schoolId, sourceType: "callback", sourceId: id, resolution: "COMPLETED" }, db);
      let assignment: Assignment | null = null;
      if (body.nextDue) {
        const dueAt = instant(body.nextDue, "Next callback due", timezone);
        const ownerId = body.nextOwnerId ? String(body.nextOwnerId) : callback.ownerId;
        if (ownerId) await validOwner(db, user, campusId, ownerId);
        const next = await db.phoneCallback.create({ data: { schoolId: user.schoolId, campusId, callId: callback.callId, ownerId, dueAt, previousId: id, createdById: user.userId } });
        await db.phoneCallbackEvent.create({ data: { schoolId: user.schoolId, campusId, callbackId: next.id, kind: "CREATED", ownerId, dueAt, note: result, actorId: user.userId } });
        if (ownerId) assignment = { callbackId: next.id, ownerId, dueAt, callerName: callback.call.name, campusId };
      }
      return { updated, assignment };
    }
    throw new ApiError("Unknown action", 400);
  });
  if (outcome.assignment) await notifyOwner(user, outcome.assignment);
  return outcome.updated;
}

/** Calls in this campus with their callbacks, notes withheld where the reader may not see them. */
export async function listCalls(user: AuthUser, campusId: string, filters: { view: string; q: string; direction: string | null }) {
  const now = new Date();
  const q = filters.q.trim().slice(0, 80);
  const qDigits = digits(q);
  const callbackWhere: Prisma.PhoneCallbackWhereInput = filters.view === "mine" ? { status: "OPEN", ownerId: user.userId }
    : filters.view === "overdue" ? { status: "OPEN", dueAt: { lt: now } }
    : filters.view === "unassigned" ? { status: "OPEN", ownerId: null }
    : { status: "OPEN" };
  const where: Prisma.PhoneCallLogWhereInput = {
    campusId, schoolId: user.schoolId,
    ...(filters.direction ? { direction: filters.direction } : {}),
    ...(filters.view === "all" ? {} : { callbacks: { some: callbackWhere } }),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { purpose: { contains: q, mode: "insensitive" } }, ...(qDigits.length >= 3 ? [{ phoneDigits: { contains: qDigits } }] : [])] } : {}),
  };
  const [rows, open] = await Promise.all([
    prisma.phoneCallLog.findMany({
      where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 300,
      include: { callbacks: { orderBy: { createdAt: "asc" }, include: { owner: { select: { id: true, fullName: true } } } } },
    }),
    prisma.phoneCallback.findMany({ where: { campusId, schoolId: user.schoolId, status: "OPEN" }, select: { ownerId: true, dueAt: true } }),
  ]);
  const data = rows.map(({ requestHash: _hash, idempotencyKey: _key, note, callbacks, ...call }) => {
    const readable = canReadNote(user, call, callbacks.map(callback => callback.ownerId));
    return {
      ...call,
      note: readable ? note : null,
      noteWithheld: Boolean(note) && !readable,
      callbacks: callbacks.map(({ outcome, ...callback }) => ({ ...callback, outcome: readable ? outcome : null, overdue: callback.status === "OPEN" && callback.dueAt < now })),
    };
  });
  return {
    data,
    counts: { open: open.length, overdue: open.filter(row => row.dueAt < now).length, unassigned: open.filter(row => !row.ownerId).length, mine: open.filter(row => row.ownerId === user.userId).length },
    owners: await ownerCandidates(user, campusId),
  };
}

/** One callback with its history; notes and outcomes follow the call's note permission. */
export async function callbackHistory(user: AuthUser, campusId: string, id: string) {
  const callback = await prisma.phoneCallback.findFirst({ where: { id, campusId, schoolId: user.schoolId }, include: { call: { include: { callbacks: { select: { ownerId: true } } } }, events: { orderBy: { createdAt: "asc" } } } });
  if (!callback || !(isFrontDesk(user) || callback.ownerId === user.userId)) throw new ApiError("Callback not found", 404);
  const readable = canReadNote(user, callback.call, callback.call.callbacks.map(row => row.ownerId));
  const ids = [...new Set(callback.events.flatMap(event => [event.actorId, event.ownerId]).filter((value): value is string => Boolean(value)))];
  const people = new Map((await prisma.user.findMany({ where: { id: { in: ids }, schoolId: user.schoolId }, select: { id: true, fullName: true } })).map(person => [person.id, person.fullName]));
  return callback.events.map(event => ({ id: event.id, kind: event.kind, dueAt: event.dueAt, createdAt: event.createdAt, note: readable ? event.note : null, actorName: people.get(event.actorId) ?? null, ownerName: event.ownerId ? people.get(event.ownerId) ?? null : null }));
}
