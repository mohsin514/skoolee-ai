import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { deliverNotification } from "@/lib/notifications/in-app";
import { liveGuardianRelationshipWhere } from "@/lib/parent/guardian-query";
import { affectedTeacherIds } from "./versions";

// Kept apart from manual.ts so the timetable service (imported by School AI execution) does not load
// notifications and their Redis connection.

/**
 * SKO-403: tell only the people a publication affects — teachers whose lessons changed and the class's
 * students and guardians — once per version. The version is claimed before sending, so a retried request
 * or a second worker never sends it twice.
 */
export async function notifyTimetableVersion(user: AuthUser, timetableId: string, versionId: string) {
  const claimed = await prisma.timetableVersion.updateMany({ where: { id: versionId, timetableId, schoolId: user.schoolId, notifiedAt: null }, data: { notifiedAt: new Date() } });
  if (!claimed.count) return { sent: false };
  const version = await prisma.timetableVersion.findUniqueOrThrow({ where: { id: versionId }, include: { timetable: { select: { classId: true, class: { select: { name: true, section: true } } } } } });
  const changes = (version.changes ?? []) as unknown as Parameters<typeof affectedTeacherIds>[0];
  if (!changes.length) return { sent: false };
  const students = await prisma.student.findMany({ where: { schoolId: user.schoolId, classId: version.timetable.classId, archivedAt: null }, select: { id: true, studentUserId: true } });
  const guardians = students.length ? await prisma.guardianRelationship.findMany({ where: { studentId: { in: students.map(s => s.id) }, ...liveGuardianRelationshipWhere(null, "learningRecords", new Date(), user.schoolId) }, select: { guardianUserId: true } }) : [];
  const recipients = [...new Set([...affectedTeacherIds(changes), ...students.map(s => s.studentUserId), ...guardians.map(g => g.guardianUserId)].filter((id): id is string => Boolean(id)))];
  try {
    await deliverNotification("TIMETABLE_CHANGED", { schoolId: user.schoolId, campusId: version.campusId, actorId: user.userId, actorName: user.fullName ?? null, recipientIds: recipients, className: [version.timetable.class.name, version.timetable.class.section].filter(Boolean).join(" "), version: version.version, effectiveFrom: version.effectiveFrom.toISOString().slice(0, 10), versionId: version.id, changeCount: changes.length });
  } catch (error) {
    // Release the claim so a retry can send it; nothing was recorded as delivered.
    await prisma.timetableVersion.updateMany({ where: { id: versionId, timetableId }, data: { notifiedAt: null } });
    throw error;
  }
  return { sent: true, recipients: recipients.length };
}
