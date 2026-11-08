import { prisma } from "@/lib/db/prisma";

/** Count current approvals, plus unreleased legacy cards awaiting remarks. */
export async function pendingReportReviewCount(schoolId: string, campusId: string) {
  const exam = { campusId, OR: [{ isLocked: true }, { status: { in: ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"] } }] };
  const [versions, legacy] = await Promise.all([
    prisma.reportVersion.findMany({
      where: { schoolId, approvedAt: null, reportCard: { campusId, exam, currentVersionId: { not: null } } },
      select: { id: true, reportCard: { select: { currentVersionId: true } } },
    }),
    prisma.reportCard.count({
      where: {
        schoolId, campusId, exam, currentVersionId: null,
        status: { notIn: ["PUBLISHED", "SENT"] },
        OR: [{ remarksApproved: false }, { remarksEn: null, remarksUr: null, remarksAr: null }],
      },
    }),
  ]);
  return legacy + versions.filter((version) => version.id === version.reportCard.currentVersionId).length;
}
