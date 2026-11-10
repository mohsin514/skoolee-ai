import type { TxClient } from "@/lib/db/prisma";

/**
 * SKAI-1543: an overpayment credit belongs to the academic year the invoice was billed in, not the
 * calendar year of the payment. A cycle labelled 2027 starts in August 2026, so a payment made in
 * January 2027 against the 2026 invoice must carry into 2027 and not 2028.
 *
 * Order: the enrollment the invoice was raised against, then the campus's ACTIVE cycle, then the
 * calendar year of the payment as a last resort.
 */
export async function paymentAcademicYear(
  tx: Pick<TxClient, "studentEnrollment" | "academicCycle">,
  invoice: { campusId: string; enrollmentId: string | null },
  paymentDate: Date,
): Promise<number> {
  if (invoice.enrollmentId) {
    const enrollment = await tx.studentEnrollment.findUnique({ where: { id: invoice.enrollmentId }, select: { academicYear: true } });
    if (enrollment) return enrollment.academicYear;
  }
  const active = await tx.academicCycle.findFirst({
    where: { campusId: invoice.campusId, status: "ACTIVE" },
    select: { academicYear: true },
  });
  return active?.academicYear ?? paymentDate.getFullYear();
}
