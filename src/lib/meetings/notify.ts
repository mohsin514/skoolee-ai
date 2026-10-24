import { prisma } from "@/lib/db/prisma";
import { deliverNotification } from "@/lib/notifications/in-app";
import { findConflicts } from "./service";

// SKO-420: meeting notices, kept apart from the service so it never loads notifications (and Redis).
// Notices name no child, agenda or note. A failed notice is logged; the booking change already stands.

type Base = { schoolId: string; campusId: string; actorId?: string | null };
const send = (event: string, base: Base, recipientIds: string[]) => recipientIds.length
  ? deliverNotification(event, { ...base, recipientIds }).catch(error => console.error(`[meetings] ${event} failed`, error))
  : Promise.resolve();

/** To the other party of a booking change; the family and staff variants link to their own page. */
export async function notifyParty(event: "MEETING_BOOKED" | "MEETING_MOVED" | "MEETING_CANCELLED", base: Base, recipientId: string, recipientIsFamily: boolean) {
  await send(event === "MEETING_BOOKED" ? event : recipientIsFamily ? `${event}_FAMILY` : event, base, [recipientId]);
}

export async function notifyFollowUp(base: Base, guardianUserId: string) { await send("MEETING_FOLLOW_UP_SHARED", base, [guardianUserId]); }

/** Recheck teachers' upcoming meetings after leave or a timetable change and tell both sides once. */
export async function reconcileMeetings(schoolId: string, teacherIds: string[], actorId: string | null) {
  const affected = await findConflicts(schoolId, teacherIds, actorId);
  await notifyConflicts(affected, actorId);
  return affected;
}

export async function notifyConflicts(bookingIds: string[], actorId: string | null) {
  if (!bookingIds.length) return;
  const bookings = await prisma.meetingBooking.findMany({ where: { id: { in: bookingIds } }, select: { schoolId: true, campusId: true, guardianUserId: true, teacherId: true } });
  for (const b of bookings) {
    await send("MEETING_NEEDS_RESCHEDULE_FAMILY", { schoolId: b.schoolId, campusId: b.campusId, actorId }, [b.guardianUserId]);
    await send("MEETING_NEEDS_RESCHEDULE", { schoolId: b.schoolId, campusId: b.campusId, actorId }, [b.teacherId]);
  }
}

/** Claim then remind: a booking is reminded once, by whichever run claims it first. */
export async function remind(booking: { id: string; schoolId: string; campusId: string; guardianUserId: string; teacherId: string }) {
  const claimed = await prisma.meetingBooking.updateMany({ where: { id: booking.id, remindedAt: null, status: "CONFIRMED" }, data: { remindedAt: new Date() } });
  if (!claimed.count) return false;
  await send("MEETING_REMINDER_FAMILY", booking, [booking.guardianUserId]);
  await send("MEETING_REMINDER", booking, [booking.teacherId]);
  return true;
}
