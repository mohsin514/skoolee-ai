import { createHash } from "node:crypto";
import type { TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-466: the visitor register. A visit is ON_SITE until checked out (LEFT); a REFUSED visitor is
// recorded and never admitted. Records are corrected, not deleted: every change keeps the previous
// values in the audit log. A visitor record never authorizes collecting a child — pickup is separate.

export const OVERDUE_HOURS = 4;
export const CONTACT_RETENTION_DAYS = 180;
const SKEW_MS = 5 * 60_000;

const text = (value: unknown, label: string, { required = false, max = 120 } = {}) => {
  const out = String(value ?? "").trim();
  if (required && out.length < 2) throw new ApiError(`${label} is required.`, 400);
  if (out.length > max) throw new ApiError(`${label} is too long (max ${max}).`, 400);
  return out || null;
};
const phoneOf = (value: unknown) => {
  const phone = text(value, "Phone", { max: 30 });
  if (phone && !/^\+?[\d\s()-]{6,30}$/.test(phone)) throw new ApiError("Enter a valid phone number or leave it empty.", 400);
  return phone;
};
const instant = (value: unknown, label: string, fallback?: Date) => {
  if (value === undefined || value === null || value === "") { if (fallback) return fallback; throw new ApiError(`${label} is required.`, 400); }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new ApiError(`${label} is not a valid time.`, 400);
  if (date.getTime() > Date.now() + SKEW_MS) throw new ApiError(`${label} cannot be in the future.`, 400);
  return date;
};
export const normalName = (name: string) => name.toLocaleLowerCase().replace(/\s+/g, " ").trim();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const snapshot = (visit: { name: string; phone: string | null; purpose: string | null; toMeet: string | null; reference: string | null; inTime: Date; outTime: Date | null; status: string }) =>
  ({ name: visit.name, purpose: visit.purpose, toMeet: visit.toMeet, reference: visit.reference, inTime: visit.inTime.toISOString(), outTime: visit.outTime?.toISOString() ?? null, status: visit.status, phone: visit.phone ? "present" : null });

/** Contact details of visits closed long ago are removed; the visit itself (who, when, whom) stays. */
export async function redactExpiredContacts(db: TxClient, campusId: string) {
  const cutoff = new Date(Date.now() - CONTACT_RETENTION_DAYS * 86_400_000);
  await db.visitorLog.updateMany({ where: { campusId, contactRedactedAt: null, status: { in: ["LEFT", "REFUSED"] }, inTime: { lt: cutoff } }, data: { phone: null, note: null, contactRedactedAt: new Date() } });
}

async function lockCampusRegister(db: TxClient, user: AuthUser, campusId: string) {
  // One check-in at a time per campus, so two desks cannot both admit the same person twice.
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM campuses WHERE id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
  if (!rows.length) throw new ApiError("Campus not found", 404);
}

export async function checkIn(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  const refused = body.action === "refuse";
  const input = {
    name: text(body.name, "Visitor name", { required: true })!,
    phone: phoneOf(body.phone),
    reference: text(body.reference, "Reference", { max: 60 }),
    purpose: text(body.purpose, "Purpose", { required: true, max: 200 })!,
    toMeet: refused ? text(body.toMeet, "Host") : text(body.toMeet, "Host (person to meet)", { required: true })!,
    note: text(body.note, "Note", { max: 500 }),
    refusedReason: refused ? text(body.refusedReason, "Reason for refusal", { required: true, max: 500 }) : null,
  };
  const inTime = instant(body.inTime, "Arrival time", new Date());
  const key = body.idempotencyKey ? String(body.idempotencyKey) : null;
  if (key && !/^[A-Za-z0-9-]{8,80}$/.test(key)) throw new ApiError("Invalid idempotency key", 400);
  const requestHash = hash({ ...input, refused });
  return schoolAiTransaction(user, async db => {
    await lockCampusRegister(db, user, campusId);
    if (key) {
      const previous = await db.visitorLog.findUnique({ where: { campusId_idempotencyKey: { campusId, idempotencyKey: key } } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ApiError("This retry does not match the original check-in. Start a new check-in instead.", 409);
        return { visit: previous, replayed: true, duplicates: [] };
      }
    }
    if (!refused) {
      const onSite = await db.visitorLog.findMany({ where: { campusId, status: "ON_SITE" }, select: { id: true, name: true, phone: true, reference: true, toMeet: true, inTime: true } });
      const same = onSite.filter(visit => normalName(visit.name) === normalName(input.name));
      // The same person (same phone, or same reference) cannot be on site twice.
      const identical = same.find(visit => (input.phone && visit.phone === input.phone) || (input.reference && visit.reference && normalName(visit.reference) === normalName(input.reference)) || (!input.phone && !input.reference && !visit.phone && !visit.reference));
      if (identical) throw Object.assign(new ApiError(`${input.name} is already on site (checked in to see ${identical.toMeet ?? "—"}). Check them out first, or add a reference if this is a different person.`, 409), { duplicates: same.map(visit => ({ id: visit.id, toMeet: visit.toMeet, reference: visit.reference, inTime: visit.inTime })) });
      // A namesake is allowed only with something that tells them apart.
      if (same.length && !input.reference) throw Object.assign(new ApiError(`Another ${input.name} is on site. Add a reference (organisation or the last digits of an ID) so the two visits can be told apart.`, 409), { duplicates: same.map(visit => ({ id: visit.id, toMeet: visit.toMeet, reference: visit.reference, inTime: visit.inTime })) });
    }
    await redactExpiredContacts(db, campusId);
    const visit = await db.visitorLog.create({ data: {
      schoolId: user.schoolId, campusId, ...input, inTime, status: refused ? "REFUSED" : "ON_SITE", checkedInById: user.userId,
      idempotencyKey: key, requestHash: key ? requestHash : null,
    } });
    await writeAuditEvent(db, user, { table: "visitor_logs", recordId: visit.id, action: refused ? "REJECT" : "CREATE", campusId, after: snapshot(visit) });
    return { visit, replayed: false, duplicates: [] };
  });
}

export async function checkOut(user: AuthUser, campusId: string, id: string, outTimeInput: unknown) {
  return schoolAiTransaction(user, async db => {
    const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM visitor_logs WHERE id = ${id} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
    if (!locked) throw new ApiError("Visit not found", 404);
    const visit = await db.visitorLog.findUniqueOrThrow({ where: { id } });
    if (visit.status === "LEFT") return { visit, replayed: true };
    if (visit.status === "REFUSED") throw new ApiError("This visitor was refused entry and was never on site.", 409);
    const outTime = instant(outTimeInput, "Departure time", new Date());
    if (outTime < visit.inTime) throw new ApiError("Departure cannot be before arrival.", 400);
    const updated = await db.visitorLog.update({ where: { id }, data: { status: "LEFT", outTime, checkedOutById: user.userId, version: { increment: 1 } } });
    await writeAuditEvent(db, user, { table: "visitor_logs", recordId: id, action: "UPDATE", campusId, before: { status: "ON_SITE" }, after: { status: "LEFT", outTime: outTime.toISOString() } });
    return { visit: updated, replayed: false };
  });
}

const CORRECTABLE = ["name", "phone", "reference", "purpose", "toMeet", "inTime", "outTime"] as const;

export async function correctVisit(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  const reason = text(body.reason, "Reason for the correction", { required: true, max: 500 });
  if (!reason || reason.length < 5) throw new ApiError("Explain the correction (at least 5 characters).", 400);
  const changes = (body.changes ?? {}) as Record<string, unknown>;
  if (!Object.keys(changes).some(field => (CORRECTABLE as readonly string[]).includes(field))) throw new ApiError("Nothing to correct.", 400);
  return schoolAiTransaction(user, async db => {
    const id = String(body.id ?? "");
    const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM visitor_logs WHERE id = ${id} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
    if (!locked) throw new ApiError("Visit not found", 404);
    const visit = await db.visitorLog.findUniqueOrThrow({ where: { id } });
    if (body.version !== undefined && Number(body.version) !== visit.version) throw new ApiError("This visit changed since you opened it. Reload and try again.", 409);
    const data: Record<string, unknown> = {};
    if ("name" in changes) data.name = text(changes.name, "Visitor name", { required: true });
    if ("phone" in changes) data.phone = phoneOf(changes.phone);
    if ("reference" in changes) data.reference = text(changes.reference, "Reference", { max: 60 });
    if ("purpose" in changes) data.purpose = text(changes.purpose, "Purpose", { required: true, max: 200 });
    if ("toMeet" in changes) data.toMeet = text(changes.toMeet, "Host", { required: visit.status !== "REFUSED" });
    const inTime = "inTime" in changes ? instant(changes.inTime, "Arrival time") : visit.inTime;
    let outTime = visit.outTime;
    if ("outTime" in changes) {
      if (visit.status !== "LEFT") throw new ApiError("Only a visit that has been checked out has a departure time to correct.", 409);
      outTime = instant(changes.outTime, "Departure time");
    }
    if (outTime && outTime < inTime) throw new ApiError("Departure cannot be before arrival.", 400);
    const updated = await db.visitorLog.update({ where: { id }, data: { ...data, inTime, outTime, version: { increment: 1 } } });
    await writeAuditEvent(db, user, { table: "visitor_logs", recordId: id, action: "UPDATE", campusId, before: snapshot(visit), after: { ...snapshot(updated), correctionReason: reason } });
    return { visit: updated, replayed: false };
  });
}
