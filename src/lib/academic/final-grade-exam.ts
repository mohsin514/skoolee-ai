import type { TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { writeAuditEvent } from "@/lib/audit-events";

/**
 * SKAI-1688: final-grade generation is serialised per campus + class + academic year. Every writer takes this
 * transaction-scoped advisory lock first, so two tabs or a retry can never both see "no final exam" and create one each.
 */
export async function lockFinalGradeScope(tx: TxClient, campusId: string, classId: string, academicYear: number) {
  const key = `final-grade:${campusId}:${classId}:${academicYear}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/** Re-checks under the lock: the loser of a race reuses the winner's exam instead of creating a second one. */
export async function findOrCreateFinalExam(
  tx: TxClient,
  user: AuthUser,
  campusId: string,
  cls: { id: string; name: string; section: string | null },
  academicYear: number,
) {
  await lockFinalGradeScope(tx, campusId, cls.id, academicYear);
  const existing = await tx.exam.findFirst({
    where: { campusId, classId: cls.id, academicYear, examType: "FINAL", subjectId: null },
  });
  if (existing) return { exam: existing, created: false };
  const created = await tx.exam.create({
    data: {
      campusId,
      classId: cls.id,
      title: `Final Grade - ${cls.name} ${cls.section || ""}`.trim(),
      term: `Academic Year ${academicYear}`,
      academicYear,
      examType: "FINAL",
      status: "PUBLISHED",
      totalMarks: 100,
      publishedAt: new Date(),
    },
  });
  await writeAuditEvent(tx, user, { table: "exams", recordId: created.id, action: "CREATE", campusId: created.campusId, after: { status: created.status, examType: created.examType, academicYear: created.academicYear, totalMarks: created.totalMarks } });
  return { exam: created, created: true };
}
