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
export const ASSESSMENT_ACTIONS = new Set(["schedule-assessment", "record-assessment", "cancel-assessment"]);

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

/** Swap places with the neighbour above or below on the campus waitlist. */
export async function moveOnWaitlist({ db, user, campusId, application }: Ctx, direction: unknown) {
  if (application.status !== "WAITLISTED" || application.waitlistRank === null) throw new ApiError("This application is not on the waitlist.", 409);
  if (direction !== "up" && direction !== "down") throw new ApiError("direction must be up or down", 400);
  const rank = application.waitlistRank;
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

export async function actOnAssessment({ db, user, campusId, application, officeNote }: Ctx, action: string, body: Record<string, unknown>) {
  const event = { schoolId: user.schoolId, applicationId: application.id, actorId: user.userId, officeNote };
  if (action === "schedule-assessment") {
    if (!BOOKABLE.includes(application.status)) throw new ApiError(`This application is ${application.status.toLowerCase().replace("_", " ")}; bookings are not available now.`, 409);
    const kind = String(body.kind ?? "").toUpperCase();
    if (!ASSESSMENT_KINDS.includes(kind)) throw new ApiError(`kind must be one of: ${ASSESSMENT_KINDS.join(", ")}`, 400);
    const scheduledAt = futureDate(body.scheduledAt, "date and time");
    const durationMin = body.durationMin === undefined ? 30 : Number(body.durationMin);
    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480) throw new ApiError("Duration must be between 5 and 480 minutes.", 400);
    const location = body.location ? String(body.location).trim().slice(0, 200) || null : null;
    const staffId = body.staffId ? String(body.staffId) : null;
    if (staffId) {
      const staff = await db.user.findFirst({ where: { id: staffId, schoolId: user.schoolId, isActive: true, role: { notIn: ["STUDENT", "PARENT"] }, OR: [{ campusId }, { role: "SUPER_ADMIN" }] }, select: { id: true } });
      if (!staff) throw new ApiError("Choose an active staff member in this campus to run it.", 400);
    }
    const booking = await db.admissionAssessment.create({ data: { schoolId: user.schoolId, applicationId: application.id, kind, scheduledAt, durationMin, location, staffId, createdById: user.userId } });
    await db.admissionApplicationEvent.create({ data: { ...event, kind: "ASSESSMENT_SCHEDULED", familyMessage: body.familyMessage ? String(body.familyMessage).trim().slice(0, 2000) || null : null, detail: { assessmentId: booking.id, kind, scheduledAt: scheduledAt.toISOString() } } });
    return booking;
  }
  const id = String(body.assessmentId ?? "");
  const booking = id ? await db.admissionAssessment.findFirst({ where: { id, applicationId: application.id, schoolId: user.schoolId } }) : null;
  if (!booking) throw new ApiError("Booking not found", 404);
  if (booking.status !== "SCHEDULED") throw new ApiError("This booking is already closed.", 409);
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
