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
    select: { id: true },
  });
  if (!student || (!target.parentUserId && !target.recipient)) throw new AccessDenied("communication", "send");
  const now = new Date();
  const relationships = await prisma.guardianRelationship.findMany({
    where: {
      schoolId: target.schoolId,
      studentId: target.studentId,
      guardianUserId: { not: null },
      status: "ACTIVE",
      verifiedAt: { not: null },
      validFrom: { lte: now },
      AND: [
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        { guardian: { isActive: true } },
        { accessVersions: { some: {
          effectiveFrom: { lte: now },
          permissions: { path: ["communication"], equals: true },
          AND: [{ OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] }],
        } } },
      ],
      ...(target.parentUserId ? { guardianUserId: target.parentUserId } : {}),
    },
    select: { email: true, phone: true, guardianUserId: true, guardian: { select: { phone: true } } },
  });
  const normalizedRecipient = channel === "EMAIL"
    ? target.recipient?.trim().toLocaleLowerCase("en-US")
    : target.recipient?.replace(/[^\d+]/g, "");
  const allowed = relationships.some((relation) => {
    if (target.parentUserId && relation.guardianUserId !== target.parentUserId) return false;
    if (!normalizedRecipient) return true;
    const contacts = channel === "EMAIL" ? [relation.email.trim().toLocaleLowerCase("en-US")] : [relation.phone, relation.guardian?.phone].map((contact) => contact?.replace(/[^\d+]/g, ""));
    return contacts.some((contact) => !!contact && contact === normalizedRecipient);
  });
  if (!allowed) throw new AccessDenied("communication", "send");
}

export async function assertPublishedCommunicationReport(reportId: string, studentId?: string | null) {
  const { getPublishedVersion } = await import("@/lib/academic/report-versions");
  const report = await prisma.reportCard.findFirst({ where: { id: reportId, ...(studentId ? { studentId } : {}) }, select: { id: true } });
  if (!report) throw new AccessDenied("report", "send");
  await getPublishedVersion(report.id);
}
