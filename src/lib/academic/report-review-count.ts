import { prisma } from "@/lib/db/prisma";

const REVIEWABLE_EXAM_STATUSES = ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"];

/** Count current approvals, plus unreleased legacy cards awaiting remarks. */
export async function pendingReportReviewCount(schoolId: string, campusId: string) {
  const exam = { campusId, OR: [{ isLocked: true }, { status: { in: REVIEWABLE_EXAM_STATUSES } }] };
  const [current, legacy] = await Promise.all([
    // SKAI-1961: one COUNT in SQL. Loading every unapproved version with its card made Prisma
    // send one (id, school_id) pair per version, which overflowed the Postgres stack on big campuses.
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM report_cards rc
      JOIN report_versions rv ON rv.id = rc.current_version_id AND rv.report_card_id = rc.id AND rv.school_id = rc.school_id
      JOIN exams e ON e.id = rc.exam_id
      WHERE rc.school_id = ${schoolId} AND rc.campus_id = ${campusId}
        AND rv.school_id = ${schoolId} AND rv.approved_at IS NULL
        AND e.school_id = ${schoolId} AND e.campus_id = ${campusId}
        AND (e.is_locked = true OR e.status = ANY(${REVIEWABLE_EXAM_STATUSES}))`,
    prisma.reportCard.count({
      where: {
        schoolId, campusId, exam, currentVersionId: null,
        status: { notIn: ["PUBLISHED", "SENT"] },
        OR: [{ remarksApproved: false }, { remarksEn: null, remarksUr: null, remarksAr: null }],
      },
    }),
  ]);
  return legacy + Number(current[0]?.n ?? 0);
}
