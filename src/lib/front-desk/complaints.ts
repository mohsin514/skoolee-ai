import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, canManageCampusOps } from "@/lib/api/scope";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-467: complaint cases. The original report (who, when, what) is never edited; assignment, notes,
// status changes, resolution and reopening are appended to ComplaintEvent. Confidential concerns are
// visible only to campus leaders and the person they are assigned to — reception queues never learn
// they exist. Nothing is deleted.

export const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
// role-ux G40 / C29: the front desk and the campus admins own front-office work. The principal (academic) and the
// super admin (governance) are never owners, and ADMIN — the campus operator of a single school — is.
export const OWNER_ROLES = ["CAMPUS_ADMIN", "ADMIN", "RECEPTIONIST"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isLeader = (user: AuthUser) => canManageCampusOps(user);
/** Front-desk staff: the receptionist and the campus admins (never the principal). */
const isFrontDesk = (user: AuthUser) => canManageCampusOps(user) || user.role === "RECEPTIONIST";
/** Rows this user may know exist. Leaders see everything in the campus; others never see confidential cases they do not own. */
export function visibleWhere(user: AuthUser): Prisma.ComplaintWhereInput {
  return isLeader(user) ? {} : { OR: [{ confidential: false }, { ownerId: user.userId }] };
}
function canAct(user: AuthUser, complaint: { confidential: boolean; ownerId: string | null }) {
  return isLeader(user) || complaint.ownerId === user.userId || (!complaint.confidential && isFrontDesk(user));
}

const text = (value: unknown, label: string, min: number, max: number) => {
  const out = String(value ?? "").trim();
  if (out.length < min) throw new ApiError(min > 1 ? `${label} needs at least ${min} characters.` : `${label} is required.`, 400);
  if (out.length > max) throw new ApiError(`${label} is too long (max ${max}).`, 400);
  return out;
};
const day = (value: unknown, label: string) => {
  const raw = String(value ?? "");
  if (!DAY.test(raw)) throw new ApiError(`${label} must be a date (YYYY-MM-DD).`, 400);
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new ApiError(`${label} is not a real date.`, 400);
  return date;
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function validOwner(db: TxClient, user: AuthUser, campusId: string, ownerId: string) {
  const owner = await db.user.findFirst({ where: { id: ownerId, schoolId: user.schoolId, isActive: true, role: { in: OWNER_ROLES as never[] }, campusId }, select: { id: true } });
  if (!owner) throw new ApiError("Choose an active front-desk or leadership colleague in this campus as the owner.", 400);
}

export async function intake(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  const anonymous = body.anonymous === true;
  const input = {
    complainantName: anonymous ? "Anonymous" : text(body.complainantName, "Complainant name", 2, 120),
    type: text(body.type, "Category", 2, 60),
    description: text(body.description, "What happened", 10, 5000),
    phone: anonymous ? null : (String(body.phone ?? "").trim() || null),
    confidential: body.confidential === true,
    date: day(body.date, "Date received"),
    ownerId: body.ownerId ? String(body.ownerId) : null,
    dueDate: body.dueDate ? day(body.dueDate, "Response due") : null,
  };
  if (input.phone && !/^\+?[\d\s()-]{6,30}$/.test(input.phone)) throw new ApiError("Enter a valid phone number or leave it empty.", 400);
  if (input.date.getTime() > Date.now() + 86_400_000) throw new ApiError("Date received cannot be in the future.", 400);
  if (input.dueDate && input.dueDate < input.date) throw new ApiError("The response due date cannot be before the date received.", 400);
  if (input.confidential && input.ownerId && !isLeader(user)) throw new ApiError("A campus leader assigns confidential concerns.", 403);
  const key = body.idempotencyKey ? String(body.idempotencyKey) : null;
  if (key && !/^[A-Za-z0-9-]{8,80}$/.test(key)) throw new ApiError("Invalid idempotency key", 400);
  const requestHash = hash({ ...input, date: input.date.toISOString(), dueDate: input.dueDate?.toISOString() ?? null });
  return schoolAiTransaction(user, async db => {
    if (key) {
      const previous = await db.complaint.findUnique({ where: { campusId_idempotencyKey: { campusId, idempotencyKey: key } } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ApiError("This retry does not match the original complaint. Start a new one instead.", 409);
        return { complaint: previous, replayed: true };
      }
    }
    if (input.ownerId) await validOwner(db, user, campusId, input.ownerId);
    const referenceCode = `CMP-${randomBytes(4).toString("hex").toUpperCase()}`;
    const complaint = await db.complaint.create({ data: { schoolId: user.schoolId, campusId, ...input, referenceCode, receivedById: user.userId, idempotencyKey: key, requestHash: key ? requestHash : null } });
    await db.complaintEvent.create({ data: { schoolId: user.schoolId, campusId, complaintId: complaint.id, kind: "CREATED", toStatus: "OPEN", ownerId: input.ownerId, dueDate: input.dueDate, actorId: user.userId } });
    return { complaint, replayed: false };
  });
}

/** One action per call, checked against the version the person was looking at. */
export async function act(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  const action = String(body.action ?? "");
  return schoolAiTransaction(user, async db => {
    const id = String(body.id ?? "");
    const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM complaints WHERE id = ${id} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
    const complaint = locked ? await db.complaint.findUnique({ where: { id } }) : null;
    // A case the person may not see answers exactly like one that does not exist.
    if (!complaint || !canAct(user, complaint)) throw new ApiError("Complaint not found", 404);
    if (body.version !== undefined && Number(body.version) !== complaint.version) throw new ApiError("This complaint changed since you opened it. Reload to see the latest before saving.", 409);
    const event = { schoolId: user.schoolId, campusId, complaintId: id, actorId: user.userId };
    const bump = { version: { increment: 1 } };
    if (action === "assign") {
      if (complaint.confidential && !isLeader(user)) throw new ApiError("A campus leader assigns confidential concerns.", 403);
      const ownerId = body.ownerId ? String(body.ownerId) : null;
      const dueDate = body.dueDate ? day(body.dueDate, "Response due") : null;
      if (ownerId) await validOwner(db, user, campusId, ownerId);
      if (dueDate && dueDate < complaint.date) throw new ApiError("The response due date cannot be before the date received.", 400);
      const updated = await db.complaint.update({ where: { id }, data: { ownerId, dueDate, ...bump } });
      await db.complaintEvent.create({ data: { ...event, kind: "ASSIGNED", ownerId, dueDate, note: body.note ? text(body.note, "Note", 2, 2000) : null } });
      return updated;
    }
    if (action === "note") {
      const note = text(body.note, "Note", 2, 2000);
      const publicResponse = body.publicResponse !== undefined ? (String(body.publicResponse).trim() || null) : undefined;
      const updated = await db.complaint.update({ where: { id }, data: { ...(publicResponse !== undefined ? { publicResponse } : {}), ...bump } });
      await db.complaintEvent.create({ data: { ...event, kind: "NOTE", note } });
      return updated;
    }
    if (action === "start") {
      if (complaint.status !== "OPEN") throw new ApiError("Only an open complaint can be started.", 409);
      const updated = await db.complaint.update({ where: { id }, data: { status: "IN_PROGRESS", ...bump } });
      await db.complaintEvent.create({ data: { ...event, kind: "STATUS", fromStatus: "OPEN", toStatus: "IN_PROGRESS" } });
      return updated;
    }
    if (action === "resolve") {
      if (complaint.status === "RESOLVED") throw new ApiError("This complaint is already resolved.", 409);
      const resolution = text(body.resolution, "Resolution", 5, 2000);
      const publicResponse = String(body.publicResponse ?? "").trim() || complaint.publicResponse;
      const updated = await db.complaint.update({ where: { id }, data: { status: "RESOLVED", resolution, resolvedAt: new Date(), publicResponse, ...bump } });
      await db.complaintEvent.create({ data: { ...event, kind: "RESOLVED", fromStatus: complaint.status, toStatus: "RESOLVED", note: resolution } });
      return updated;
    }
    if (action === "reopen") {
      if (complaint.status !== "RESOLVED") throw new ApiError("Only a resolved complaint can be reopened.", 409);
      const reason = text(body.reason, "Reason for reopening", 5, 2000);
      const updated = await db.complaint.update({ where: { id }, data: { status: "OPEN", resolution: null, resolvedAt: null, reopenedCount: { increment: 1 }, ...bump } });
      await db.complaintEvent.create({ data: { ...event, kind: "REOPENED", fromStatus: "RESOLVED", toStatus: "OPEN", note: reason } });
      return updated;
    }
    throw new ApiError("Unknown action", 400);
  });
}

export function overdue(row: { status: string; dueDate: Date | null }, today: Date) {
  return row.status !== "RESOLVED" && row.dueDate !== null && row.dueDate < today;
}
