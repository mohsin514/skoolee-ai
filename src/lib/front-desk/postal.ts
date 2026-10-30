import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { resolveSourceActions } from "@/lib/notifications/actions";
import { deliverNotification } from "@/lib/notifications/in-app";
import { ownerCandidates } from "./phone-calls";

// SKO-464: the postal and courier register. An item is tracked to a handoff, not to a log entry:
// incoming items go RECEIVED → ASSIGNED → COLLECTED, outgoing PREPARED → DISPATCHED → DELIVERED, and
// closing needs the person it was handed to (and, for deliveries, how delivery was confirmed) —
// a tracking number alone is never delivery. Corrections keep the values they replaced; nothing is deleted.

export const CLOSED = ["COLLECTED", "DELIVERED"];
// role-ux G40 / C29: the front desk and the campus admins own front-office work. The principal (academic) and the
// super admin (governance) are never owners, and ADMIN — the campus operator of a single school — is.
export const OWNER_ROLES = ["CAMPUS_ADMIN", "ADMIN", "RECEPTIONIST"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CORRECTABLE = ["fromName", "toName", "courier", "referenceNo", "note", "handedTo"] as const;
const LIMITS: Record<(typeof CORRECTABLE)[number], number> = { fromName: 120, toName: 120, courier: 60, referenceNo: 80, note: 500, handedTo: 120 };

const text = (value: unknown, label: string, min: number, max: number) => {
  const out = String(value ?? "").trim();
  if (out.length < min) throw new ApiError(min > 1 ? `${label} needs at least ${min} characters.` : `${label} is required.`, 400);
  if (out.length > max) throw new ApiError(`${label} is too long (max ${max}).`, 400);
  return out;
};
const optional = (value: unknown, label: string, max: number) => {
  const out = String(value ?? "").trim();
  if (out.length > max) throw new ApiError(`${label} is too long (max ${max}).`, 400);
  return out || null;
};
const day = (value: unknown) => {
  const raw = String(value ?? "");
  if (!DAY.test(raw)) throw new ApiError("Date must be a date (YYYY-MM-DD).", 400);
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new ApiError("Date is not a real date.", 400);
  if (date.getTime() > Date.now() + 86_400_000) throw new ApiError("The date cannot be in the future.", 400);
  return date;
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Courier references are compared without spaces, dashes or case, so "AB 123-45" and "ab12345" are one parcel. */
const comparable = (reference: string) => reference.replace(/[\s-]/g, "").toLowerCase();

async function validOwner(db: TxClient, user: AuthUser, campusId: string, ownerId: string) {
  const owner = await db.user.findFirst({ where: { id: ownerId, schoolId: user.schoolId, isActive: true, role: { in: OWNER_ROLES as never[] }, campusId }, select: { id: true } });
  if (!owner) throw new ApiError("Choose an active front-desk or leadership colleague in this campus as the owner.", 400);
}

type Assignment = { postalId: string; ownerId: string; itemCode: string; campusId: string };
async function notifyOwner(user: AuthUser, assignment: Assignment) {
  if (assignment.ownerId === user.userId) return;
  await deliverNotification("POSTAL_ASSIGNED", { schoolId: user.schoolId, campusId: assignment.campusId, actorId: user.userId, actorName: user.fullName ?? null, ownerId: assignment.ownerId, postalId: assignment.postalId, itemCode: assignment.itemCode })
    .catch(error => console.error("[postal] owner notification failed", error));
}

export async function logItem(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  const direction = String(body.direction ?? "");
  if (!["RECEIVE", "DISPATCH"].includes(direction)) throw new ApiError("Choose incoming or outgoing.", 400);
  const input = {
    direction,
    date: day(body.date),
    fromName: optional(body.fromName, "Sender", 120),
    toName: text(body.toName, direction === "RECEIVE" ? "Recipient" : "Addressee", 2, 120),
    courier: optional(body.courier, "Courier", 60),
    referenceNo: optional(body.referenceNo, "Tracking or reference number", 80),
    note: optional(body.note, "Note", 500),
    ownerId: body.ownerId ? String(body.ownerId) : null,
  };
  const key = body.idempotencyKey ? String(body.idempotencyKey) : null;
  if (key && !/^[A-Za-z0-9-]{8,80}$/.test(key)) throw new ApiError("Invalid idempotency key", 400);
  const requestHash = hash({ ...input, date: input.date.toISOString() });
  const result = await schoolAiTransaction(user, async db => {
    if (key) {
      const previous = await db.postalRecord.findUnique({ where: { campusId_idempotencyKey: { campusId, idempotencyKey: key } } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ApiError("This retry does not match the item you first saved. Start a new entry instead.", 409);
        return { item: previous, replayed: true, assignment: null };
      }
    }
    // Serialise logging per campus so two desks scanning the same label cannot both open an item.
    const [campus] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM campuses WHERE id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
    if (!campus) throw new ApiError("Campus not found", 404);
    if (input.referenceNo) {
      const open = await db.postalRecord.findMany({ where: { campusId, schoolId: user.schoolId, direction, status: { notIn: CLOSED }, referenceNo: { not: null } }, select: { itemCode: true, referenceNo: true } });
      const same = open.find(row => row.referenceNo && comparable(row.referenceNo) === comparable(input.referenceNo!));
      if (same) throw new ApiError(`An open item with this reference is already recorded as ${same.itemCode}. Update that item instead.`, 409);
    }
    if (input.ownerId) await validOwner(db, user, campusId, input.ownerId);
    const status = direction === "DISPATCH" ? "PREPARED" : input.ownerId ? "ASSIGNED" : "RECEIVED";
    const itemCode = `PST-${randomBytes(4).toString("hex").toUpperCase()}`;
    const item = await db.postalRecord.create({ data: { schoolId: user.schoolId, campusId, ...input, status, itemCode, recordedById: user.userId, idempotencyKey: key, requestHash: key ? requestHash : null } });
    const snapshot = { fromName: input.fromName, toName: input.toName, courier: input.courier, referenceNo: input.referenceNo, note: input.note };
    await db.postalEvent.create({ data: { schoolId: user.schoolId, campusId, postalId: item.id, kind: "CREATED", toStatus: status, ownerId: input.ownerId, changes: snapshot, actorId: user.userId } });
    return { item, replayed: false, assignment: input.ownerId ? { postalId: item.id, ownerId: input.ownerId, itemCode, campusId } : null };
  });
  if (result.assignment) await notifyOwner(user, result.assignment);
  return result;
}

/** One handoff step per call, checked against the version the person was looking at. */
export async function actOnItem(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  const action = String(body.action ?? "");
  const outcome = await schoolAiTransaction(user, async db => {
    const id = String(body.id ?? "");
    const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM postal_records WHERE id = ${id} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
    const item = locked ? await db.postalRecord.findUnique({ where: { id } }) : null;
    if (!item) throw new ApiError("Postal item not found", 404);
    if (body.version !== undefined && Number(body.version) !== item.version) throw new ApiError("This item changed since you opened it. Reload to see the latest before saving.", 409);
    const closed = CLOSED.includes(item.status);
    const event = { schoolId: user.schoolId, campusId, postalId: id, actorId: user.userId };
    const bump = { version: { increment: 1 } };
    const note = optional(body.note, "Note", 500);
    const resolve = () => resolveSourceActions({ schoolId: user.schoolId, sourceType: "postal", sourceId: id, resolution: "COMPLETED" }, db);

    if (action === "assign") {
      if (closed) throw new ApiError("This item is already handed over. Its history is kept.", 409);
      const ownerId = body.ownerId ? String(body.ownerId) : null;
      if (ownerId === item.ownerId) throw new ApiError("This item already has that owner.", 409);
      if (ownerId) await validOwner(db, user, campusId, ownerId);
      const status = item.direction === "RECEIVE" ? (ownerId ? "ASSIGNED" : "RECEIVED") : item.status;
      const updated = await db.postalRecord.update({ where: { id }, data: { ownerId, status, ...bump } });
      await db.postalEvent.create({ data: { ...event, kind: "ASSIGNED", fromStatus: item.status, toStatus: status, ownerId, note } });
      await resolveSourceActions({ schoolId: user.schoolId, sourceType: "postal", sourceId: id, resolution: "REASSIGNED", exceptUserIds: ownerId ? [ownerId] : [] }, db);
      return { updated, assignment: ownerId ? { postalId: id, ownerId, itemCode: item.itemCode ?? "", campusId } : null };
    }
    if (action === "dispatch") {
      if (item.direction !== "DISPATCH" || item.status !== "PREPARED") throw new ApiError("Only an outgoing item that is still being prepared can be dispatched.", 409);
      const courier = text(body.courier ?? item.courier, "Courier", 2, 60);
      const referenceNo = optional(body.referenceNo, "Tracking or reference number", 80) ?? item.referenceNo;
      const updated = await db.postalRecord.update({ where: { id }, data: { status: "DISPATCHED", courier, referenceNo, ...bump } });
      await db.postalEvent.create({ data: { ...event, kind: "DISPATCHED", fromStatus: item.status, toStatus: "DISPATCHED", changes: { courier, referenceNo }, note } });
      return { updated, assignment: null };
    }
    if (action === "collect") {
      if (item.direction !== "RECEIVE" || closed) throw new ApiError("Only an incoming item that has not been handed over can be collected.", 409);
      const handedTo = text(body.handedTo, "Collected by", 2, 120);
      const updated = await db.postalRecord.update({ where: { id }, data: { status: "COLLECTED", handedTo, closedAt: new Date(), ...bump } });
      await db.postalEvent.create({ data: { ...event, kind: "COLLECTED", fromStatus: item.status, toStatus: "COLLECTED", changes: { handedTo }, note } });
      await resolve();
      return { updated, assignment: null };
    }
    if (action === "deliver") {
      if (item.direction !== "DISPATCH" || item.status !== "DISPATCHED") throw new ApiError("Only a dispatched item can be marked delivered.", 409);
      const handedTo = text(body.handedTo, "Received by", 2, 120);
      const evidence = text(body.note, "How delivery was confirmed", 5, 500);
      const updated = await db.postalRecord.update({ where: { id }, data: { status: "DELIVERED", handedTo, closedAt: new Date(), ...bump } });
      await db.postalEvent.create({ data: { ...event, kind: "DELIVERED", fromStatus: item.status, toStatus: "DELIVERED", changes: { handedTo }, note: evidence } });
      await resolve();
      return { updated, assignment: null };
    }
    if (action === "correct") {
      const reason = text(body.reason, "Reason for the correction", 5, 500);
      const fields = (body.fields ?? {}) as Record<string, unknown>;
      const changes: Record<string, { from: string | null; to: string | null }> = {};
      const data: Partial<Record<(typeof CORRECTABLE)[number], string | null>> = {};
      for (const field of CORRECTABLE) {
        if (!(field in fields)) continue;
        if (field === "handedTo" && !closed) throw new ApiError("The handover can only be corrected after the item is handed over.", 400);
        const next = field === "toName" || field === "handedTo" ? text(fields[field], field === "toName" ? "Recipient" : "Handed to", 2, LIMITS[field]) : optional(fields[field], "Value", LIMITS[field]);
        if (next !== item[field]) { changes[field] = { from: item[field], to: next }; data[field] = next; }
      }
      if (!Object.keys(changes).length) throw new ApiError("Nothing changed. Edit a value before saving the correction.", 400);
      const updated = await db.postalRecord.update({ where: { id }, data: { ...data, ...bump } });
      await db.postalEvent.create({ data: { ...event, kind: "CORRECTED", changes, note: reason } });
      return { updated, assignment: null };
    }
    throw new ApiError("Unknown action", 400);
  });
  if (outcome.assignment) await notifyOwner(user, outcome.assignment);
  return outcome.updated;
}

export async function listItems(user: AuthUser, campusId: string, filters: { view: string; direction: string | null; q: string }) {
  const q = filters.q.trim().slice(0, 80);
  const where: Prisma.PostalRecordWhereInput = {
    campusId, schoolId: user.schoolId,
    ...(filters.direction ? { direction: filters.direction } : {}),
    ...(filters.view === "active" ? { status: { notIn: CLOSED } } : filters.view === "closed" ? { status: { in: CLOSED } } : filters.view === "mine" ? { status: { notIn: CLOSED }, ownerId: user.userId } : {}),
    ...(q ? { OR: [{ itemCode: { contains: q, mode: "insensitive" } }, { referenceNo: { contains: q, mode: "insensitive" } }, { fromName: { contains: q, mode: "insensitive" } }, { toName: { contains: q, mode: "insensitive" } }, { courier: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, active] = await Promise.all([
    prisma.postalRecord.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 300, include: { owner: { select: { id: true, fullName: true } } } }),
    prisma.postalRecord.findMany({ where: { campusId, schoolId: user.schoolId, status: { notIn: CLOSED } }, select: { direction: true, status: true, ownerId: true } }),
  ]);
  return {
    // Owner candidates for the pickers (G40): campus admins and receptionists of this campus.
    owners: await ownerCandidates(user, campusId),
    data: rows.map(({ requestHash: _hash, idempotencyKey: _key, fileKey: _file, ...row }) => row),
    counts: {
      awaitingCollection: active.filter(row => row.direction === "RECEIVE").length,
      toDispatch: active.filter(row => row.status === "PREPARED").length,
      inTransit: active.filter(row => row.status === "DISPATCHED").length,
      unassigned: active.filter(row => !row.ownerId).length,
      mine: active.filter(row => row.ownerId === user.userId).length,
    },
  };
}

export async function itemHistory(user: AuthUser, campusId: string, id: string) {
  const item = await prisma.postalRecord.findFirst({ where: { id, campusId, schoolId: user.schoolId }, include: { events: { orderBy: { createdAt: "asc" } } } });
  if (!item) throw new ApiError("Postal item not found", 404);
  const ids = [...new Set(item.events.flatMap(event => [event.actorId, event.ownerId]).filter((value): value is string => Boolean(value)))];
  const people = new Map((await prisma.user.findMany({ where: { id: { in: ids }, schoolId: user.schoolId }, select: { id: true, fullName: true } })).map(person => [person.id, person.fullName]));
  return item.events.map(event => ({ id: event.id, kind: event.kind, fromStatus: event.fromStatus, toStatus: event.toStatus, changes: event.changes, note: event.note, createdAt: event.createdAt, actorName: people.get(event.actorId) ?? null, ownerName: event.ownerId ? people.get(event.ownerId) ?? null : null }));
}

