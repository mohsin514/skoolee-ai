import type { Prisma } from "@prisma/client";
import type { TxClient } from "@/lib/db/prisma";
import { versionTransaction } from "@/lib/academic/report-versions";
import { renderLocaleReceipt } from "@/lib/locale/invoice-pdf";
/** Capture at collection, or before correcting a legacy payment. Existing
 * external receipt URLs remain intact. Never regenerate from a changed invoice. */
export async function capturePaymentReceipt(tx: TxClient, paymentId: string) {
    const existing = await tx.paymentReceipt.findUnique({ where: { paymentId } });
    if (existing)
        return existing;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { id: true, schoolId: true, campusId: true, currency: true, receiptNo: true, paymentDate: true, paymentMethod: true, referenceNumber: true, amount: true, fineAmount: true, discountAmount: true, note: true,
            campus: { select: { name: true, city: true, address: true, phone: true, email: true, website: true, logoUrl: true, school: { select: { logoUrl: true, phone: true, website: true, tagline: true, contactEmail: true } } } },
            student: { select: { fullName: true, rollNo: true, class: { select: { name: true, section: true } } } },
            invoice: { select: { enrollment: true, currency: true, localeSnapshot: true, invoiceNumber: true, totalAmount: true, totalAmountPaid: true, balanceDue: true } }, recorder: { select: { fullName: true } } } });
    // Use the immutable invoice enrollment period, not today's placement.
    if (payment.invoice.enrollment) {
        payment.student.rollNo = payment.invoice.enrollment.rollNo;
        payment.student.class = { name: payment.invoice.enrollment.className, section: null };
        payment.campus.name = payment.invoice.enrollment.campusName;
    }
    return tx.paymentReceipt.create({ data: { schoolId: payment.schoolId, campusId: payment.campusId, paymentId, snapshot: JSON.parse(JSON.stringify({ ...payment, invoice: { ...payment.invoice, currency: payment.currency } })) as Prisma.InputJsonValue } });
}
export async function immutablePaymentPdf(paymentId: string) {
    return versionTransaction(async (tx) => {
        const receipt = await capturePaymentReceipt(tx, paymentId);
        if (receipt.documentBytes)
            return Buffer.from(receipt.documentBytes);
        const snapshot = receipt.snapshot as unknown as Parameters<typeof renderLocaleReceipt>[0];
        const bytes = await renderLocaleReceipt({ ...snapshot, paymentDate: new Date(snapshot.paymentDate) });
        await tx.paymentReceipt.update({ where: { id: receipt.id }, data: { documentBytes: new Uint8Array(bytes) } });
        return bytes;
    });
}
