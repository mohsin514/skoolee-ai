import { createHash } from "node:crypto";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageFinance } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { lockInvoiceGeneration } from "@/lib/fees/invoice-generation";
import { activationFor } from "@/lib/tax/service";

/**
 * SKAI-1669: the fees office acts on a library charge the desk handed over. Accepting posts one fee invoice for the
 * reader's student record (one-time fee = the charge) and links it to the charge (status POSTED); the family then sees it
 * in the normal fee views. A replay returns the same invoice. Returning sends it back to the desk's OPEN queue with a reason.
 */
async function financeScope(user: AuthUser) {
  if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
  await assertPermission(user, "fees", "add");
  if (!user.campusId && user.role !== "SUPER_ADMIN") throw new ApiError("Choose a campus first.", 400);
  return { schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId! }) };
}

export async function acceptLibraryCharge(user: AuthUser, chargeId: string) {
  const scope = { id: String(chargeId || ""), ...(await financeScope(user)) };
  return prisma.$transaction(async tx => {
    const initial = await tx.libraryCharge.findFirst({ where: scope, select: { campusId: true } });
    if (!initial) throw new ApiError("Library charge not found", 404);
    await lockInvoiceGeneration(tx, user.schoolId, initial.campusId);
    const charge = (await tx.libraryCharge.findFirst({ where: scope }))!;
    if (charge.status === "POSTED" && charge.invoiceId) return { invoiceId: charge.invoiceId, replayed: true };
    if (charge.status !== "HANDED_TO_FEES") throw new ApiError("Only a charge handed to the fees office can be posted.", 409);
    if (!(charge.amount > 0)) throw new ApiError("Only a positive charge can be invoiced.", 409);
    const member = await tx.libraryMember.findFirst({ where: { id: charge.memberId, schoolId: user.schoolId, campusId: charge.campusId }, select: { userId: true } });
    const student = member && await tx.student.findFirst({ where: { studentUserId: member.userId, schoolId: user.schoolId, campusId: charge.campusId }, select: { id: true, enrollments: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 } } });
    if (!student) throw new ApiError("This reader has no student record on this campus to invoice. Return the charge to the library.", 409);
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    // Same rule as the batch path: a campus with an invoice tax package issues tax documents from Fees generation.
    if (await activationFor(tx, user.schoolId, charge.campusId, today)) throw new ApiError("This campus has an approved invoice tax package. Bill this charge from Fees so a tax document is issued.", 409);
    const id = createHash("sha256").update(`library-charge-invoice:${charge.id}`).digest("hex");
    const invoice = await tx.invoice.create({ data: { schoolId: user.schoolId, campusId: charge.campusId, studentId: student.id, enrollmentId: student.enrollments[0]?.id ?? null, invoiceNumber: `LIB-${id.slice(0, 20).toUpperCase()}`, currency: charge.currency, invoiceDate: today, dueDate: new Date(today.getTime() + 14 * 86_400_000), monthlyFee: 0, oneTimeFees: charge.amount, subtotal: charge.amount, totalAmount: charge.amount, balanceDue: charge.amount, status: "PENDING" } });
    const claimed = await tx.libraryCharge.updateMany({ where: { id: charge.id, status: "HANDED_TO_FEES", invoiceId: null }, data: { status: "POSTED", invoiceId: invoice.id } });
    if (!claimed.count) throw new ApiError("This charge was decided by someone else. Refresh the queue.", 409);
    await writeAuditEvent(tx, user, { table: "library_charges", recordId: charge.id, action: "UPDATE", campusId: charge.campusId, before: { status: charge.status }, after: { status: "POSTED", invoiceId: invoice.id, amount: charge.amount, currency: charge.currency } });
    return { invoiceId: invoice.id, replayed: false };
  });
}

export async function returnLibraryCharge(user: AuthUser, chargeId: string, reasonInput: unknown) {
  const reason = String(reasonInput ?? "").trim();
  if (reason.length < 8 || reason.length > 500) throw new ApiError("Say why the charge goes back to the library (8–500 characters).", 400);
  const scope = { id: String(chargeId || ""), ...(await financeScope(user)) };
  return prisma.$transaction(async tx => {
    const charge = await tx.libraryCharge.findFirst({ where: scope });
    if (!charge) throw new ApiError("Library charge not found", 404);
    const done = await tx.libraryCharge.updateMany({ where: { id: charge.id, status: "HANDED_TO_FEES" }, data: { status: "OPEN", financeNote: reason } });
    if (!done.count) throw new ApiError("Only a charge waiting in the fees office can be returned.", 409);
    await writeAuditEvent(tx, user, { table: "library_charges", recordId: charge.id, action: "UPDATE", campusId: charge.campusId, before: { status: charge.status }, after: { status: "OPEN", financeNote: reason } });
    return { id: charge.id, status: "OPEN" };
  });
}
