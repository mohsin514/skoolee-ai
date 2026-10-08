import { prisma } from "@/lib/db/prisma";
import { AccessDenied } from "./policy";

/** Recheck queued recipient relationships immediately before delivery. */
export async function assertCommunicationTarget(target: {
  schoolId: string; campusId?: string | null; studentId?: string | null;
  parentUserId?: string | null; recipient?: string | null;
}, channel: string) {
  if (!target.studentId) return; // Institution announcements use a trusted service identity.
  const student = await prisma.student.findFirst({
    where: { id: target.studentId, schoolId: target.schoolId, ...(target.campusId ? { campusId: target.campusId } : {}) },
    select: { parentUserId: true, guardianEmail: true, guardianPhone: true, guardianWhatsapp: true,
      parent: { select: { email: true, phone: true, isActive: true } } },
  });
  if (!student || (target.parentUserId && target.parentUserId !== student.parentUserId)) throw new AccessDenied("communication", "send");
  const contacts = channel === "EMAIL"
    ? [student.guardianEmail, student.parent?.isActive ? student.parent.email : null]
    : [student.guardianPhone, student.guardianWhatsapp, student.parent?.isActive ? student.parent.phone : null];
  if (target.recipient && !contacts.filter(Boolean).includes(target.recipient)) throw new AccessDenied("communication", "send");
}

export async function assertPublishedCommunicationReport(reportId: string, studentId?: string | null) {
  const { getPublishedVersion } = await import("@/lib/academic/report-versions");
  const report = await prisma.reportCard.findFirst({ where: { id: reportId, ...(studentId ? { studentId } : {}) }, select: { id: true } });
  if (!report) throw new AccessDenied("report", "send");
  await getPublishedVersion(report.id);
}
