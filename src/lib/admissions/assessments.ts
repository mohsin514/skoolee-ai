import type { AdmissionApplication } from "@prisma/client";
import type { TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";

// SKAI-1142: interviews, entrance assessments, tours and taster days booked against an application, the
// offer's respond-by date and the waitlist order. Each change is also an application event, so the history
// reads end to end. Called from actOnApplication inside its locked transaction.

export const ASSESSMENT_KINDS = ["INTERVIEW", "ASSESSMENT", "TOUR", "TASTER_DAY"];
export const RECOMMENDATIONS = ["RECOMMEND", "CONSIDER", "NOT_RECOMMENDED"];
/** Bookings are possible while the school is still deciding. */
const BOOKABLE = ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "WAITLISTED"];
export const ASSESSMENT_ACTIONS = new Set(["schedule-assessment", "offer-slots", "record-assessment", "cancel-assessment"]);
/** SKAI-1263: at most this many open slots are offered to a family at once. */
export const MAX_OFFERED_SLOTS = 6;

type Ctx = { db: TxClient; user: AuthUser; campusId: string; application: AdmissionApplication; officeNote: string | null };

function futureDate(value: unknown, label: string, now = new Date()) {
  const date = new Date(String(value ?? ""));
  if (!value || Number.isNaN(date.getTime())) throw new ApiError(`Enter a valid ${label}.`, 400);
  if (date.getTime() < now.getTime() - 60_000) throw new ApiError(`The ${label} must be in the future.`, 400);
  return date;
}

/** The respond-by date sent with an offer; optional, at most a year out. */
export function offerDeadline(value: unknown, now = new Date()) {
  if (value === undefined || value === null || value === "") return null;
  const date = futureDate(value, "respond-by date", now);
  if (date.getTime() > now.getTime() + 366 * 86_400_000) throw new ApiError("The respond-by date must be within a year.", 400);
  return date;
}

export const offerLapsed = (application: Pick<AdmissionApplication, "status" | "offerExpiresAt">, now = new Date()) =>
  application.status === "OFFERED" && Boolean(application.offerExpiresAt && application.offerExpiresAt < now);

/** Next waitlist position in the campus: one after the last. */
export async function nextWaitlistRank(db: TxClient, schoolId: string, campusId: string) {
  const last = await db.admissionApplication.aggregate({ where: { schoolId, campusId, status: "WAITLISTED" }, _max: { waitlistRank: true } });
  return (last._max.waitlistRank ?? 0) + 1;
}

/**
 * SKAI-1420: waitlist positions are read and written under one campus row lock, held until the caller's
 * transaction commits. A second decision waits, then reads the first one's committed position, so two
 * decisions can never be given the same rank. Callers must already be inside a transaction.
 */
export async function lockCampusWaitlist(db: TxClient, schoolId: string, campusId: string) {
  await db.$queryRaw`SELECT id FROM campuses WHERE id = ${campusId} AND school_id = ${schoolId} FOR UPDATE`;
}

export async function assignWaitlistRank(db: TxClient, schoolId: string, campusId: string) {
  await lockCampusWaitlist(db, schoolId, campusId);
  return nextWaitlistRank(db, schoolId, campusId);
}

/** Swap places with the neighbour above or below on the campus waitlist. */
export async function moveOnWaitlist({ db, user, campusId, application }: Ctx, direction: unknown) {
  if (application.status !== "WAITLISTED" || application.waitlistRank === null) throw new ApiError("This application is not on the waitlist.", 409);
  if (direction !== "up" && direction !== "down") throw new ApiError("direction must be up or down", 400);
  const rank = application.waitlistRank;
  await lockCampusWaitlist(db, user.schoolId, campusId);
  const neighbour = await db.admissionApplication.findFirst({
    where: { schoolId: user.schoolId, campusId, status: "WAITLISTED", id: { not: application.id }, waitlistRank: direction === "up" ? { lt: rank } : { gt: rank } },
    orderBy: { waitlistRank: direction === "up" ? "desc" : "asc" },
    select: { id: true, waitlistRank: true },
  });
  if (!neighbour) return { rank, moved: false };
  const target = neighbour.waitlistRank;
  await db.admissionApplication.update({ where: { id: neighbour.id }, data: { waitlistRank: rank, version: { increment: 1 } } });
  await db.admissionApplication.update({ where: { id: application.id }, data: { waitlistRank: target, version: { increment: 1 } } });
  await db.admissionApplicationEvent.create({ data: { schoolId: user.schoolId, applicationId: application.id, actorId: user.userId, kind: "WAITLIST_MOVED", detail: { from: rank, to: target } } });
  return { rank: target, moved: true };
}

type Slot = { scheduledAt: Date; durationMin: number; location: string | null; staffId: string | null };

/** The time, length, room and person of one booking or offered slot, validated against this school and campus. */
async function slotFields(db: TxClient, user: AuthUser, campusId: string, body: Record<string, unknown>): Promise<Slot> {
  const scheduledAt = futureDate(body.scheduledAt, "date and time");
  const durationMin = body.durationMin === undefined ? 30 : Number(body.durationMin);
  if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480) throw new ApiError("Duration must be between 5 and 480 minutes.", 400);
  const location = body.location ? String(body.location).trim().slice(0, 200) || null : null;
  const staffId = body.staffId ? String(body.staffId) : null;
  if (staffId) {
    const staff = await db.user.findFirst({ where: { id: staffId, schoolId: user.schoolId, isActive: true, role: { notIn: ["STUDENT", "PARENT"] }, OR: [{ campusId }, { role: "SUPER_ADMIN" }] }, select: { id: true } });
    if (!staff) throw new ApiError("Choose an active staff member in this campus to run it.", 400);
  }
  return { scheduledAt, durationMin, location, staffId };
}

/** SKAI-1349: the same interviewer or room cannot be double-booked for overlapping times. */
async function assertNoClash(db: TxClient, schoolId: string, slot: Slot, exceptId?: string) {
  const { scheduledAt, durationMin, staffId, location } = slot;
  const end = scheduledAt.getTime() + durationMin * 60_000;
  const candidates = await db.admissionAssessment.findMany({
    where: { schoolId, status: "SCHEDULED", scheduledAt: { gt: new Date(scheduledAt.getTime() - 480 * 60_000), lt: new Date(end) } },
    select: { id: true, scheduledAt: true, durationMin: true, staffId: true, location: true },
  });
  const clash = candidates.some((other) => other.id !== exceptId && other.scheduledAt.getTime() < end && other.scheduledAt.getTime() + other.durationMin * 60_000 > scheduledAt.getTime() && ((staffId !== null && other.staffId === staffId) || (location !== null && other.location === location)));
  if (clash) throw new ApiError("That staff member or room is already booked for an overlapping time.", 409);
}

/**
 * SKAI-1263: staff offer a family a few times to choose from. Each is an OFFERED row; nothing is held until the
 * family picks one (bookOfferedSlot), so offering the same time to two families is allowed and first to pick wins.
 */
async function offerSlots({ db, user, campusId, application, officeNote }: Ctx, kind: string, raw: unknown, familyMessage: string | null) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OFFERED_SLOTS) throw new ApiError(`Offer between 1 and ${MAX_OFFERED_SLOTS} times.`, 400);
  const open = await db.admissionAssessment.count({ where: { schoolId: user.schoolId, applicationId: application.id, status: "OFFERED" } });
  if (open + raw.length > MAX_OFFERED_SLOTS) throw new ApiError(`A family can have at most ${MAX_OFFERED_SLOTS} open times to choose from. Withdraw some first.`, 409);
  const slots = [];
  for (const item of raw) slots.push(await slotFields(db, user, campusId, (item ?? {}) as Record<string, unknown>));
  if (new Set(slots.map(slot => slot.scheduledAt.getTime())).size !== slots.length) throw new ApiError("Each offered time must be different.", 400);
  const created = [];
  for (const slot of slots) created.push(await db.admissionAssessment.create({ data: { schoolId: user.schoolId, applicationId: application.id, kind, ...slot, status: "OFFERED", createdById: user.userId } }));
  await db.admissionApplicationEvent.create({ data: { schoolId: user.schoolId, applicationId: application.id, actorId: user.userId, officeNote, kind: "ASSESSMENT_SLOTS_OFFERED", familyMessage, detail: { kind, assessmentIds: created.map(row => row.id) } } });
  return created;
}

/**
 * SKAI-1263: the family picks one offered time. The caller holds the application row lock. The picked slot becomes
 * the booking (still refused if the interviewer or room was booked meanwhile); the other open times of the same
 * kind are withdrawn. Picking the slot already booked is a replay.
 */
export async function bookOfferedSlot(db: TxClient, application: AdmissionApplication, assessmentId: unknown) {
  const id = String(assessmentId ?? "");
  const slot = id ? await db.admissionAssessment.findFirst({ where: { id, applicationId: application.id, schoolId: application.schoolId } }) : null;
  if (!slot || !["OFFERED", "SCHEDULED"].includes(slot.status)) throw new ApiError("That time is no longer available. Reload to see the times you can choose.", 404);
  if (slot.status === "SCHEDULED") return slot;
  if (!BOOKABLE.includes(application.status)) throw new ApiError("Bookings are not available for this application now.", 409);
  if (slot.scheduledAt.getTime() < Date.now()) throw new ApiError("That time has passed. Choose another or contact the school.", 409);
  await assertNoClash(db, application.schoolId, slot, slot.id);
  const booked = await db.admissionAssessment.update({ where: { id: slot.id }, data: { status: "SCHEDULED" } });
  await db.admissionAssessment.updateMany({ where: { schoolId: application.schoolId, applicationId: application.id, kind: slot.kind, status: "OFFERED", id: { not: slot.id } }, data: { status: "CANCELLED" } });
  await db.admissionApplicationEvent.create({ data: { schoolId: application.schoolId, applicationId: application.id, actorId: "FAMILY", kind: "ASSESSMENT_BOOKED", detail: { assessmentId: slot.id, kind: slot.kind, scheduledAt: slot.scheduledAt.toISOString() } } });
  return booked;
}

export async function actOnAssessment({ db, user, campusId, application, officeNote }: Ctx, action: string, body: Record<string, unknown>) {
  const event = { schoolId: user.schoolId, applicationId: application.id, actorId: user.userId, officeNote };
  if (action === "schedule-assessment" || action === "offer-slots") {
    if (!BOOKABLE.includes(application.status)) throw new ApiError(`This application is ${application.status.toLowerCase().replace("_", " ")}; bookings are not available now.`, 409);
    const kind = String(body.kind ?? "").toUpperCase();
    if (!ASSESSMENT_KINDS.includes(kind)) throw new ApiError(`kind must be one of: ${ASSESSMENT_KINDS.join(", ")}`, 400);
    const familyMessage = body.familyMessage ? String(body.familyMessage).trim().slice(0, 2000) || null : null;
    if (action === "offer-slots") return offerSlots({ db, user, campusId, application, officeNote }, kind, body.slots, familyMessage);
    const slot = await slotFields(db, user, campusId, body);
    // SKAI-1422: a retry of the same booking after a lost response replays the original. The application row is locked
    // by the caller, so two retries cannot both pass this check.
    const original = await db.admissionAssessment.findFirst({ where: { schoolId: user.schoolId, applicationId: application.id, status: "SCHEDULED", kind, ...slot } });
    if (original) return original;
    await assertNoClash(db, user.schoolId, slot);
    const booking = await db.admissionAssessment.create({ data: { schoolId: user.schoolId, applicationId: application.id, kind, ...slot, createdById: user.userId } });
    await db.admissionApplicationEvent.create({ data: { ...event, kind: "ASSESSMENT_SCHEDULED", familyMessage, detail: { assessmentId: booking.id, kind, scheduledAt: slot.scheduledAt.toISOString() } } });
    return booking;
  }
  const id = String(body.assessmentId ?? "");
  const booking = id ? await db.admissionAssessment.findFirst({ where: { id, applicationId: application.id, schoolId: user.schoolId } }) : null;
  if (!booking) throw new ApiError("Booking not found", 404);
  // SKAI-1263: a slot offered to the family and not yet picked can be withdrawn, but has no outcome to record.
  if (booking.status !== "SCHEDULED" && !(action === "cancel-assessment" && booking.status === "OFFERED")) throw new ApiError("This booking is already closed.", 409);
  if (action === "cancel-assessment") {
    if (!officeNote) throw new ApiError("Add an office note saying why it was cancelled.", 400);
    const updated = await db.admissionAssessment.update({ where: { id }, data: { status: "CANCELLED" } });
    await db.admissionApplicationEvent.create({ data: { ...event, kind: "ASSESSMENT_CANCELLED", detail: { assessmentId: id, kind: booking.kind } } });
    return updated;
  }
  // record-assessment
  const attended = body.attended !== false;
  const recommendation = attended ? String(body.recommendation ?? "").toUpperCase() : null;
  if (attended && !RECOMMENDATIONS.includes(recommendation!)) throw new ApiError(`recommendation must be one of: ${RECOMMENDATIONS.join(", ")}`, 400);
  const score = attended && body.score !== undefined && body.score !== null && body.score !== "" ? Number(body.score) : null;
  if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) throw new ApiError("Score must be a whole number from 0 to 100.", 400);
  const outcomeNote = body.outcomeNote ? String(body.outcomeNote).trim().slice(0, 2000) || null : null;
  const updated = await db.admissionAssessment.update({ where: { id }, data: { status: attended ? "COMPLETED" : "NO_SHOW", recommendation, score, outcomeNote } });
  await db.admissionApplicationEvent.create({ data: { ...event, kind: "ASSESSMENT_RECORDED", detail: { assessmentId: id, kind: booking.kind, status: updated.status, recommendation, score } } });
  return updated;
}
