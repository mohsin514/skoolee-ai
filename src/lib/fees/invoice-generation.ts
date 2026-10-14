import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { moduleFlags } from "@/lib/permissions";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { Prisma } from "@prisma/client";

/** A pupil's monthly bill survives a campus transfer. The tenant client normally
 * restricts invoice reads to the actor's campus, so use an explicit school and
 * current-pupil-scope projection here; never select another campus's amounts. */
export async function existingMonthlyStudentInvoices(tx: Pick<TxClient, "$queryRaw">, schoolId: string, campusId: string, studentIds: string[], start: Date, end: Date) {
  if (!studentIds.length) return [];
  return tx.$queryRaw<Array<{ id: string; studentId: string; invoiceDate: Date }>>(Prisma.sql`
    SELECT DISTINCT ON (i.student_id) i.id, i.student_id AS "studentId", i.invoice_date AS "invoiceDate"
    FROM invoices i JOIN students s ON s.id=i.student_id AND s.school_id=i.school_id
    WHERE i.school_id=${schoolId} AND s.campus_id=${campusId}
      AND i.student_id IN (${Prisma.join([...new Set(studentIds)])})
      AND i.invoice_date >= ${start.toISOString().slice(0, 10)}::date
      AND i.invoice_date < ${end.toISOString().slice(0, 10)}::date
    ORDER BY i.student_id, i.id`);
}

/** All invoice generators fence the same campus before reading monthly bills. */
export async function lockInvoiceGeneration(tx: TxClient, schoolId: string, campusId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`UPDATE campuses SET created_at=created_at WHERE id=${campusId} AND school_id=${schoolId} AND archived_at IS NULL RETURNING id`;
  if (!rows.length) throw new ApiError("Campus not found or no longer active", 404);
}

export async function assertInvoiceGenerationAccess(user: AuthUser, campusId: string, tx: TxClient) {
  if (!canManageOperations(user) || user.role !== "SUPER_ADMIN" && user.campusId !== campusId) throw new ApiError("Invoice generation is not permitted in this campus", 403);
  const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new ApiError("Your account access changed. Sign in again.", 403);
  const permissions = await tx.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role }, select: { module: true, canView: true, canAdd: true, canEdit: true, canDelete: true } });
  const fees = moduleFlags(permissions, user.role, "fees");
  if (!fees.canView || !fees.canAdd) throw new ApiError("Insufficient permissions: fees.view and fees.add are required", 403);
  await assertSchoolOperational(user.schoolId, tx);
}

/** No notifications, mail or provider calls belong inside this retry boundary. */
export async function invoiceGenerationTransaction<T>(user: AuthUser, campusId: string, work: (tx: TxClient) => Promise<T>) {
  return schoolAiTransaction(user, async tx => {
    await lockInvoiceGeneration(tx, user.schoolId, campusId);
    await assertInvoiceGenerationAccess(user, campusId, tx);
    return work(tx);
  });
}
