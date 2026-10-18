import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { guardianHasAccess } from "@/lib/parent/guardian-access";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { tripConsentStatus } from "@/lib/family/trips";
import { requestAdjustment } from "@/lib/fees/adjustments-service";

// SKO-440: clubs, sports and trips on one roster.
// - Interest, reservation and confirmed participation are separate states. Places are taken under a row lock
//   on the activity, so the last place goes to exactly one request; the next one joins the waitlist.
// - Eligibility (the activity's classes) and schedule clashes with the learner's other places are explained
//   before anything is committed.
// - A reserved place is conditional until the school's rules are met: trip consent for the current terms
//   (the SKO-421 trip record — a material change there makes the place conditional again) and the fee
//   (paid, waived, or free). Only then is it confirmed.
// - A freed place offers the oldest waitlisted learner an expiring offer; accepting reserves it, declining or
//   letting it expire offers the next. Expired offers are settled whenever the activity is read or changed.
// - Cancelling releases the place once. A paid place hands off one refund request to the reviewed finance
//   workflow (same idempotency key on every retry), never money directly.
// This module sends no notifications (see ./notify).

const HOLDING = ["OFFERED", "RESERVED", "CONFIRMED"];
const ACTIVE = ["WAITLIST", ...HOLDING];
const KINDS = ["CLUB", "SPORT", "TRIP"] as const;
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isCoordinator = (user: AuthUser, activity?: { coordinatorId: string; staffIds: string[]; campusId: string }) => (canManageOperations(user) && (!activity || user.role === "SUPER_ADMIN" || user.campusId === activity.campusId)) || Boolean(activity && (activity.coordinatorId === user.userId || activity.staffIds.includes(user.userId)));

export async function createActivity(user: AuthUser, body: Record<string, unknown>) {
  if (!canManageOperations(user) && user.role !== "TEACHER") throw new ApiError("Only staff publish activities.", 403);
  const kind = String(body.kind ?? "");
  if (!KINDS.includes(kind as typeof KINDS[number])) throw new ApiError("Choose club, sport or trip.", 400);
  const title = text(body.title, 120), location = text(body.location, 160), cancellationTerms = text(body.cancellationTerms, 600);
  if (!title || !location) throw new ApiError("Give the activity a title and a place.", 400);
  if (!cancellationTerms) throw new ApiError("State the cancellation and refund terms families will see.", 400);
  const startsAt = new Date(String(body.startsAt ?? "")), endsAt = new Date(String(body.endsAt ?? ""));
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new ApiError("Set when the activity starts and ends.", 400);
  const capacity = Number(body.capacity), costAmount = Number(body.costAmount ?? 0);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 2000) throw new ApiError("Capacity is a whole number of places.", 400);
  if (!Number.isInteger(costAmount) || costAmount < 0) throw new ApiError("The cost is a whole amount (0 for free).", 400);
  const campusId = user.role === "SUPER_ADMIN" ? String(body.campusId ?? user.campusId ?? "") : user.campusId ?? "";
  const classIds = (Array.isArray(body.classIds) ? body.classIds : []).map(String);
  if (classIds.length && await prisma.class.count({ where: { schoolId: user.schoolId, campusId, id: { in: classIds } } }) !== classIds.length) throw new ApiError("Choose classes of this campus.", 400);
  const tripId = body.tripId ? String(body.tripId) : null;
  if (kind === "TRIP" && !tripId) throw new ApiError("Link the trip's consent record so places can depend on it.", 400);
  if (tripId && !await prisma.trip.count({ where: { id: tripId, schoolId: user.schoolId, campusId, status: "OPEN" } })) throw new ApiError("Trip not found", 400);
  const offerHours = Number(body.offerHours ?? 48);
  try {
    return await prisma.activity.create({ data: { schoolId: user.schoolId, campusId, kind, title, description: text(body.description, 2000), location, startsAt, endsAt, capacity, classIds, staffIds: (Array.isArray(body.staffIds) ? body.staffIds : []).map(String), costAmount, costCurrency: text(body.costCurrency, 3).toUpperCase() || "PKR", tripId, offerHours: Number.isInteger(offerHours) && offerHours >= 1 && offerHours <= 336 ? offerHours : 48, cancellationTerms, coordinatorId: user.userId } });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("This trip already has an activity.", 409); throw error; }
}

async function lockActivity(tx: TxClient, schoolId: string, activityId: string) {
  await tx.$queryRaw`SELECT id FROM activities WHERE id = ${activityId} AND school_id = ${schoolId} FOR UPDATE`;
  const activity = await tx.activity.findFirst({ where: { id: activityId, schoolId } });
  if (!activity) throw new ApiError("Activity not found", 404);
  return activity;
}

type Act = Prisma.ActivityGetPayload<object>;

/** Expire lapsed offers and offer freed places to the waitlist, oldest first. Returns new offers. */
async function settle(tx: TxClient, activity: Act) {
  const now = new Date(), offered: string[] = [];
  await tx.activityPlace.updateMany({ where: { activityId: activity.id, status: "OFFERED", offerExpiresAt: { lte: now } }, data: { status: "EXPIRED", version: { increment: 1 } } });
  if (activity.status !== "PUBLISHED") return offered;
  const holding = await tx.activityPlace.count({ where: { activityId: activity.id, status: { in: HOLDING } } });
  const free = activity.capacity - holding;
  if (free <= 0) return offered;
  const next = await tx.activityPlace.findMany({ where: { activityId: activity.id, status: "WAITLIST" }, orderBy: { createdAt: "asc" }, take: free });
  for (const place of next) {
    await tx.activityPlace.update({ where: { id: place.id }, data: { status: "OFFERED", offerExpiresAt: new Date(now.getTime() + activity.offerHours * 3_600_000), version: { increment: 1 } } });
    offered.push(place.id);
  }
  return offered;
}

/** Settle expiries and offers in their own transaction, so a refused action never rolls them back. */
async function settleNow(user: AuthUser, activityId: string) {
  return schoolAiTransaction(user, async tx => settle(tx, await lockActivity(tx, user.schoolId, activityId)));
}

/** Recompute conditional ↔ confirmed from consent and fee rules. */
async function syncRequirements(tx: TxClient, activity: Act) {
  const places = await tx.activityPlace.findMany({ where: { activityId: activity.id, status: { in: ["RESERVED", "CONFIRMED"] } } });
  if (!places.length) return;
  const consent = activity.tripId ? await tripConsentStatus(tx, activity.schoolId, activity.tripId, places.map(p => p.studentId)) : null;
  for (const p of places) {
    const consentOk = !consent || consent.get(p.studentId) === "GRANTED";
    const feeOk = activity.costAmount === 0 || p.feeStatus === "PAID" || p.feeStatus === "WAIVED";
    const want = consentOk && feeOk ? "CONFIRMED" : "RESERVED";
    if (want !== p.status) await tx.activityPlace.update({ where: { id: p.id }, data: { status: want, version: { increment: 1 } } });
  }
}

/** Why this learner cannot take a place, or null. */
async function blockerFor(db: TxClient, activity: Act, student: { id: string; classId: string | null; campusId: string }) {
  if (activity.status !== "PUBLISHED") return "This activity was cancelled.";
  if (activity.endsAt <= new Date()) return "This activity has finished.";
  if (student.campusId !== activity.campusId) return "This activity is for another campus.";
  if (activity.classIds.length && (!student.classId || !activity.classIds.includes(student.classId))) return "This activity is not open to this learner's class.";
  const clash = await db.activityPlace.findFirst({ where: { studentId: student.id, status: { in: ["RESERVED", "CONFIRMED"] }, activityId: { not: activity.id }, activity: { status: "PUBLISHED", startsAt: { lt: activity.endsAt }, endsAt: { gt: activity.startsAt } } } });
  if (clash) return "This overlaps with another of this learner's activities.";
  return null;
}

async function familyChild(user: AuthUser, studentId: string) {
  if (user.role !== "PARENT") throw new ApiError("Only a guardian can request a place.", 403);
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId, archivedAt: null, status: "active" }, select: { id: true, classId: true, campusId: true, fullName: true } });
  if (!student || !await guardianHasAccess({ schoolId: user.schoolId, studentId, guardianUserId: user.userId, permission: "communication" })) throw new ApiError("Only an authorized guardian can request a place for this child.", 404);
  return student;
}

/** A guardian asks for a place: reserved if one is free, otherwise the waitlist. Explained before commit. */
export async function requestPlace(user: AuthUser, body: Record<string, unknown>) {
  const student = await familyChild(user, String(body.studentId ?? ""));
  const offered = await settleNow(user, String(body.activityId ?? ""));
  return schoolAiTransaction(user, async tx => {
    const activity = await lockActivity(tx, user.schoolId, String(body.activityId ?? ""));
    const blocker = await blockerFor(tx, activity, student);
    if (blocker) throw new ApiError(blocker, 409);
    const existing = await tx.activityPlace.findUnique({ where: { activityId_studentId: { activityId: activity.id, studentId: student.id } } });
    if (existing && ACTIVE.includes(existing.status)) return { place: existing, offered, repeated: true };
    const holding = await tx.activityPlace.count({ where: { activityId: activity.id, status: { in: HOLDING } } });
    const waiting = await tx.activityPlace.count({ where: { activityId: activity.id, status: "WAITLIST" } });
    const status = holding < activity.capacity && !waiting ? "RESERVED" : "WAITLIST";
    // A new request after a decline or cancellation joins the back of the queue.
    const data = { status, requestedById: user.userId, feeStatus: activity.costAmount > 0 ? "DUE" : "NONE", offerExpiresAt: null, cancelledAt: null, cancelledById: null, cancelReason: null, refundState: null, createdAt: new Date(), version: { increment: 1 } };
    const place = existing ? await tx.activityPlace.update({ where: { id: existing.id }, data }) : await tx.activityPlace.create({ data: { schoolId: user.schoolId, activityId: activity.id, studentId: student.id, requestedById: user.userId, status, feeStatus: activity.costAmount > 0 ? "DUE" : "NONE" } });
    if (status === "RESERVED") { await linkTrip(tx, activity, student.id); await syncRequirements(tx, activity); }
    return { place: await tx.activityPlace.findUniqueOrThrow({ where: { id: place.id } }), offered, repeated: false };
  });
}

/** Trip places make the learner a trip invitee, so the SKO-421 consent request reaches the family. */
async function linkTrip(tx: TxClient, activity: Act, studentId: string) {
  if (!activity.tripId) return;
  const invited = await tx.tripInvitee.findFirst({ where: { tripId: activity.tripId, studentId } });
  if (!invited) await tx.tripInvitee.create({ data: { schoolId: activity.schoolId, tripId: activity.tripId, studentId } });
}

async function placeFor(user: AuthUser, tx: TxClient, placeId: string) {
  const place = await tx.activityPlace.findFirst({ where: { id: placeId, schoolId: user.schoolId }, include: { activity: true } });
  if (!place) throw new ApiError("Place not found", 404);
  if (user.role === "PARENT") {
    if (!await guardianHasAccess({ schoolId: user.schoolId, studentId: place.studentId, guardianUserId: user.userId, permission: "communication" })) throw new ApiError("Place not found", 404);
  } else if (!isCoordinator(user, place.activity)) throw new ApiError("Place not found", 404);
  return place;
}

/** Accept or decline an expiring offer. */
export async function answerOffer(user: AuthUser, body: Record<string, unknown>) {
  const target = await placeFor(user, prisma, String(body.placeId ?? ""));
  await settleNow(user, target.activityId);
  return schoolAiTransaction(user, async tx => {
    const first = await placeFor(user, tx, target.id);
    const activity = await lockActivity(tx, user.schoolId, first.activityId);
    const place = await tx.activityPlace.findUniqueOrThrow({ where: { id: first.id } });
    if (place.status !== "OFFERED") throw new ApiError(place.status === "EXPIRED" ? "This offer has expired. You can join the waitlist again." : "There is no open offer for this place.", 409);
    if (Number(body.knownVersion) !== place.version) throw new ApiError("This offer changed since you opened it. Review the latest details.", 409);
    if (body.accept === true) {
      const student = await tx.student.findFirstOrThrow({ where: { id: place.studentId }, select: { id: true, classId: true, campusId: true } });
      const blocker = await blockerFor(tx, activity, student);
      if (blocker) throw new ApiError(blocker, 409);
      await tx.activityPlace.update({ where: { id: place.id }, data: { status: "RESERVED", offerExpiresAt: null, version: { increment: 1 } } });
      await linkTrip(tx, activity, place.studentId);
      await syncRequirements(tx, activity);
      return { status: "RESERVED", offered: [] as string[] };
    }
    await tx.activityPlace.update({ where: { id: place.id }, data: { status: "DECLINED", offerExpiresAt: null, version: { increment: 1 } } });
    return { status: "DECLINED", offered: await settle(tx, activity) };
  });
}

/**
 * Cancel a place (guardian withdrawal or coordinator). Releases capacity once; a paid place records that a
 * refund is needed, and the coordinator's request goes to the finance workflow exactly once.
 */
export async function cancelPlace(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const first = await placeFor(user, tx, String(body.placeId ?? ""));
    const activity = await lockActivity(tx, user.schoolId, first.activityId);
    const place = await tx.activityPlace.findUniqueOrThrow({ where: { id: first.id } });
    if (place.status === "CANCELLED") return { status: "CANCELLED", offered: [] as string[], repeated: true };
    if (!ACTIVE.includes(place.status)) throw new ApiError("This place is no longer active.", 409);
    const late = activity.startsAt.getTime() - Date.now() < 24 * 3_600_000;
    await tx.activityPlace.update({ where: { id: place.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: user.userId, cancelReason: text(body.reason, 300) || (late ? "Late withdrawal" : null), offerExpiresAt: null, refundState: place.feeStatus === "PAID" ? "NEEDED" : null, version: { increment: 1 } } });
    return { status: "CANCELLED", offered: await settle(tx, activity), repeated: false, late };
  });
}

/** Coordinator hands a paid cancellation to finance as one refund request (idempotent per place). */
export async function requestRefund(user: AuthUser, body: Record<string, unknown>) {
  const place = await prisma.activityPlace.findFirst({ where: { id: String(body.placeId ?? ""), schoolId: user.schoolId }, include: { activity: true } });
  if (!place || !isCoordinator(user, place.activity) || !canManageOperations(user)) throw new ApiError("Only campus leaders hand refunds to finance.", 403);
  if (place.refundState === "REQUESTED" && place.refundAdjustmentId) return { adjustmentId: place.refundAdjustmentId, repeated: true };
  if (place.status !== "CANCELLED" || place.refundState !== "NEEDED" || !place.invoiceId) throw new ApiError("Only a cancelled paid place with its invoice can be refunded.", 409);
  const adjustment = await requestAdjustment(user, { kind: "REFUND", invoiceId: place.invoiceId, paymentId: place.paymentId, amount: place.activity.costAmount, reasonCategory: "WITHDRAWAL", reason: `Activity place cancelled: ${place.activity.title}`, publicExplanation: "Refund for a cancelled activity place, following the stated cancellation terms.", idempotencyKey: `activity-refund-${place.id}` });
  await prisma.activityPlace.update({ where: { id: place.id }, data: { refundState: "REQUESTED", refundAdjustmentId: adjustment.id, version: { increment: 1 } } });
  return { adjustmentId: adjustment.id, repeated: false };
}

/** Coordinator records the fee outcome (paid against an invoice, or waived), then requirements re-run. */
export async function recordFee(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const first = await placeFor(user, tx, String(body.placeId ?? ""));
    if (user.role === "PARENT") throw new ApiError("Place not found", 404);
    const activity = await lockActivity(tx, user.schoolId, first.activityId);
    const status = String(body.feeStatus ?? "");
    if (!["PAID", "WAIVED", "DUE"].includes(status)) throw new ApiError("Choose paid, waived or due.", 400);
    let invoiceId: string | null = null, paymentId: string | null = null;
    if (status === "PAID") {
      invoiceId = String(body.invoiceId ?? "");
      if (!await tx.invoice.count({ where: { id: invoiceId, schoolId: user.schoolId, studentId: first.studentId } })) throw new ApiError("Choose this learner's invoice that records the payment.", 400);
      paymentId = body.paymentId ? String(body.paymentId) : null;
    }
    if (status === "WAIVED" && !canManageOperations(user)) throw new ApiError("Only campus leaders waive a fee.", 403);
    await tx.activityPlace.update({ where: { id: first.id }, data: { feeStatus: status, invoiceId, paymentId, version: { increment: 1 } } });
    await syncRequirements(tx, activity);
    return { feeStatus: status };
  });
}

// ─── Reading ─────────────────────────────────────────────────────────────

const requirements = (activity: Act, place: { feeStatus: string; status: string }, consent: string | undefined) => ({
  consent: activity.tripId ? (consent ?? "PENDING") : "NOT_REQUIRED",
  fee: activity.costAmount === 0 ? "NOT_REQUIRED" : place.feeStatus,
});

/** Family view: activities open to this child, with explained availability and the child's place. */
export async function familyActivities(user: AuthUser, studentId: string) {
  const student = await familyChild(user, studentId);
  const now = new Date();
  const activities = await prisma.activity.findMany({ where: { schoolId: user.schoolId, campusId: student.campusId, status: "PUBLISHED", endsAt: { gt: now } }, orderBy: { startsAt: "asc" }, take: 50 });
  for (const a of activities) await prisma.$transaction(async tx => { await settle(tx as TxClient, a); await syncRequirements(tx as TxClient, a); });
  const places = await prisma.activityPlace.findMany({ where: { schoolId: user.schoolId, studentId: student.id, activityId: { in: activities.map(a => a.id) } } });
  const counts = await prisma.activityPlace.groupBy({ by: ["activityId"], where: { activityId: { in: activities.map(a => a.id) }, status: { in: HOLDING } }, _count: { _all: true } });
  const out = [];
  for (const a of activities) {
    const place = places.find(p => p.activityId === a.id) ?? null;
    const consent = a.tripId && place ? (await tripConsentStatus(prisma, user.schoolId, a.tripId, [student.id])).get(student.id) : undefined;
    const blocker = place && ACTIVE.includes(place.status) ? null : await blockerFor(prisma, a, student);
    const taken = counts.find(c => c.activityId === a.id)?._count._all ?? 0;
    const position = place?.status === "WAITLIST" ? await prisma.activityPlace.count({ where: { activityId: a.id, status: "WAITLIST", createdAt: { lte: place.createdAt } } }) : null;
    out.push({ id: a.id, kind: a.kind, title: a.title, description: a.description, location: a.location, startsAt: a.startsAt, endsAt: a.endsAt, costAmount: a.costAmount, costCurrency: a.costCurrency, cancellationTerms: a.cancellationTerms, placesLeft: Math.max(0, a.capacity - taken), capacity: a.capacity, blocker,
      place: place ? { id: place.id, status: place.status, version: place.version, offerExpiresAt: place.offerExpiresAt, waitlistPosition: position, requirements: requirements(a, place, consent), refundState: place.refundState } : null });
  }
  return { child: { id: student.id, name: student.fullName }, activities: out };
}

/** Coordinator roster: who is confirmed or conditional and what is missing; no care or medical detail. */
export async function roster(user: AuthUser, activityId: string) {
  const activity = await prisma.activity.findFirst({ where: { id: activityId, schoolId: user.schoolId } });
  if (!activity || !isCoordinator(user, activity)) throw new ApiError("Activity not found", 404);
  await prisma.$transaction(async tx => { await settle(tx as TxClient, activity); await syncRequirements(tx as TxClient, activity); });
  const places = await prisma.activityPlace.findMany({ where: { activityId }, orderBy: { createdAt: "asc" } });
  const students = new Map((await prisma.student.findMany({ where: { schoolId: user.schoolId, id: { in: places.map(p => p.studentId) } }, select: { id: true, fullName: true, rollNo: true, class: { select: { name: true, section: true } } } })).map(s => [s.id, s]));
  const consent = activity.tripId ? await tripConsentStatus(prisma, user.schoolId, activity.tripId, places.map(p => p.studentId)) : null;
  const sessions = await prisma.activitySession.findMany({ where: { activityId }, orderBy: { startsAt: "asc" } });
  const marks = sessions.length ? await prisma.activityAttendance.findMany({ where: { sessionId: { in: sessions.map(s => s.id) } } }) : [];
  return {
    activity: { ...activity, placesTaken: places.filter(p => HOLDING.includes(p.status)).length },
    places: places.map(p => { const s = students.get(p.studentId); return { id: p.id, studentId: p.studentId, name: s?.fullName ?? "", className: [s?.class?.name, s?.class?.section].filter(Boolean).join(" "), status: p.status, version: p.version, offerExpiresAt: p.offerExpiresAt, feeStatus: p.feeStatus, invoiceId: p.invoiceId, refundState: p.refundState, refundAdjustmentId: p.refundAdjustmentId, cancelReason: p.cancelReason, requirements: requirements(activity, p, consent?.get(p.studentId)) }; }),
    sessions: sessions.map(s => ({ ...s, marks: marks.filter(m => m.sessionId === s.id).map(m => ({ studentId: m.studentId, status: m.status })) })),
  };
}

export async function staffActivities(user: AuthUser) {
  if (!canManageOperations(user) && user.role !== "TEACHER") throw new ApiError("Activities are for staff.", 403);
  const where: Prisma.ActivityWhereInput = { schoolId: user.schoolId, ...(canManageOperations(user) ? (user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) : { OR: [{ coordinatorId: user.userId }, { staffIds: { has: user.userId } }] }) };
  const rows = await prisma.activity.findMany({ where, orderBy: { startsAt: "asc" }, take: 100 });
  const counts = rows.length ? await prisma.activityPlace.groupBy({ by: ["activityId", "status"], where: { activityId: { in: rows.map(r => r.id) } }, _count: { _all: true } }) : [];
  const [classes, trips] = await Promise.all([
    prisma.class.findMany({ where: { schoolId: user.schoolId, campusId: user.campusId ?? undefined, archivedAt: null }, select: { id: true, name: true, section: true }, orderBy: { name: "asc" } }),
    prisma.trip.findMany({ where: { schoolId: user.schoolId, campusId: user.campusId ?? undefined, status: "OPEN" }, include: { versions: { orderBy: { version: "desc" }, take: 1, select: { title: true } } } }),
  ]);
  return { activities: rows.map(r => ({ ...r, counts: Object.fromEntries(counts.filter(c => c.activityId === r.id).map(c => [c.status, c._count._all])) })), classes: classes.map(c => ({ id: c.id, name: [c.name, c.section].filter(Boolean).join(" ") })), trips: trips.map(t => ({ id: t.id, title: t.versions[0]?.title ?? "" })) };
}

export async function addSession(user: AuthUser, body: Record<string, unknown>) {
  const activity = await prisma.activity.findFirst({ where: { id: String(body.activityId ?? ""), schoolId: user.schoolId } });
  if (!activity || !isCoordinator(user, activity)) throw new ApiError("Activity not found", 404);
  const startsAt = new Date(String(body.startsAt ?? "")), endsAt = new Date(String(body.endsAt ?? ""));
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new ApiError("Set when the session starts and ends.", 400);
  return prisma.activitySession.create({ data: { schoolId: user.schoolId, activityId: activity.id, startsAt, endsAt } });
}

/** Mark session attendance for confirmed participants only. */
export async function markAttendance(user: AuthUser, body: Record<string, unknown>) {
  const session = await prisma.activitySession.findFirst({ where: { id: String(body.sessionId ?? ""), schoolId: user.schoolId }, include: { activity: true } });
  if (!session || !isCoordinator(user, session.activity)) throw new ApiError("Session not found", 404);
  const studentId = String(body.studentId ?? ""), status = String(body.status ?? "");
  if (!["PRESENT", "ABSENT", "LATE_WITHDRAWAL"].includes(status)) throw new ApiError("Choose present, absent or late withdrawal.", 400);
  if (!await prisma.activityPlace.count({ where: { activityId: session.activityId, studentId, status: "CONFIRMED" } })) throw new ApiError("Only confirmed participants are marked.", 409);
  return prisma.activityAttendance.upsert({ where: { sessionId_studentId: { sessionId: session.id, studentId } }, create: { schoolId: user.schoolId, sessionId: session.id, studentId, status, markedById: user.userId }, update: { status, markedById: user.userId, markedAt: new Date() } });
}

export async function cancelActivity(user: AuthUser, activityId: string) {
  return schoolAiTransaction(user, async tx => {
    const activity = await lockActivity(tx, user.schoolId, activityId);
    if (!isCoordinator(user, activity) || !canManageOperations(user)) throw new ApiError("Only campus leaders cancel an activity.", 403);
    await tx.activity.update({ where: { id: activity.id }, data: { status: "CANCELLED" } });
    const live = await tx.activityPlace.findMany({ where: { activityId, status: { in: ACTIVE } } });
    for (const p of live) await tx.activityPlace.update({ where: { id: p.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: user.userId, cancelReason: "Activity cancelled by the school", refundState: p.feeStatus === "PAID" ? "NEEDED" : null, version: { increment: 1 } } });
    return { cancelled: live.length, studentIds: live.map(p => p.studentId) };
  });
}

/** Guardians of these learners who can act (for notices). */
export async function guardiansOf(schoolId: string, studentIds: string[]) {
  if (!studentIds.length) return [];
  const rows = await prisma.guardianRelationship.findMany({ where: { schoolId, studentId: { in: studentIds }, status: "ACTIVE", guardianUserId: { not: null } }, select: { guardianUserId: true } });
  return [...new Set(rows.map(r => r.guardianUserId!))];
}
