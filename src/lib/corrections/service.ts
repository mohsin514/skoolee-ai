import { correctionReleased } from "./visibility";
import { capturePaymentReceipt } from "@/lib/fees/receipt";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, assertPermission } from "@/lib/api/scope";
import { campusScope, studentScope, isFamily } from "@/lib/auth/policy";
import { isCampusAdminRole } from "@/lib/roles";
import { contentHash, refreshVersion, versionTransaction } from "@/lib/academic/report-versions";
import { gradeForMark, thresholdsForClass } from "@/lib/academic/report-cards";
import { assertSeparateApprover, validateCorrectionRequest, previewMarkCorrection, previewPaymentReversal, invoiceAfterReversal } from "./domain";
export type Kind = "MARK" | "PAYMENT";
export type Proposal = {
    kind: Kind;
    sourceId: string;
    expectedVersion: string;
    marksObtained?: number;
    isAbsent?: boolean;
    allocations?: {
        invoiceId: string;
        minor: number;
    }[];
    unappliedMinor?: number;
};
const academic = (u: AuthUser) => u.role === "SUPER_ADMIN" || u.role === "PRINCIPAL" || isCampusAdminRole(u.role);
export async function permit(user: AuthUser, kind: Kind, write = false, approve = false) {
    if (isFamily(user)) {
        if (write)
            throw new ApiError("Only authorized staff can request corrections", 403);
        return;
    }
    if (kind === "MARK" ? !(academic(user) || (!approve && user.role === "TEACHER")) : !(academic(user) || user.role === "ACCOUNTANT"))
        throw new ApiError("This role cannot review this correction domain", 403);
    await assertPermission(user, kind === "MARK" ? "reports" : "fees", write ? "edit" : "view");
}
async function source(tx: TxClient, user: AuthUser, kind: Kind, id: string) {
    await permit(user, kind);
    if (isFamily(user))
        throw new ApiError("Families view released history, not draft source records", 403);
    if (kind === "MARK") {
        const mark = await tx.mark.findFirst({ where: { id, ...campusScope(user), ...(user.role === "TEACHER" ? { OR: [{ subject: { teacherId: user.userId } }, { exam: { class: { classTeacherId: user.userId } } }] } : {}) }, include: { subject: true, exam: true, student: { select: { fullName: true } } } });
        if (!mark)
            throw new ApiError("Record unavailable in your scope", 403);
        const reports = await tx.reportCard.findMany({ where: { studentId: mark.studentId }, select: { id: true, currentVersionId: true, publishedVersionId: true, sourceRevision: true } });
        const thresholds = await thresholdsForClass(mark.exam.classId, mark.exam.academicYear, tx);
        const snapshot = { grade: mark.grade, thresholds, marksObtained: mark.marksObtained, isAbsent: mark.isAbsent, maximum: mark.subject.totalMarks, reports };
        return { kind, row: mark, label: `${mark.student.fullName} · ${mark.subject.name}`, version: contentHash({ revision: mark.correctionVersion, snapshot }), snapshot };
    }
    const payment = await tx.payment.findFirst({ where: { id, ...campusScope(user), reversalOfId: null, amount: { gt: 0 } }, include: { invoice: true, student: { select: { fullName: true } }, ledgerEntry: true } });
    if (!payment)
        throw new ApiError("Payment unavailable in your scope", 403);
    const reversals = await tx.payment.findMany({ where: { reversalOfId: id } });
    const entries = await tx.paymentAllocation.findMany({ where: { paymentId: { in: [id, ...reversals.map(r => r.id)] } } });
    const allocations = new Map<string, number>();
    let credit = 0;
    for (const a of entries) {
        if (a.currency !== payment.currency)
            throw new ApiError("Allocation currency needs reconciliation", 409);
        allocations.set(a.invoiceId, (allocations.get(a.invoiceId) ?? 0) + a.amount);
        credit += a.credit;
    }
    const invoices = await tx.invoice.findMany({ where: { id: { in: [...allocations.keys()] }, ...campusScope(user), studentId: payment.studentId } });
    if (invoices.length !== allocations.size || invoices.some(i => i.currency !== payment.currency))
        throw new ApiError("Payment allocations need reconciliation", 409);
    const carry = await tx.feeCarryForward.findUnique({ where: { studentId_toAcademicYear: { studentId: payment.studentId, toAcademicYear: payment.paymentDate.getFullYear() + 1 } } });
    const snapshot = { ledger: payment.ledgerEntry ? { id: payment.ledgerEntry.id, amount: payment.ledgerEntry.amount, currency: payment.ledgerEntry.currency, accountId: payment.ledgerEntry.accountId, bankAccountId: payment.ledgerEntry.bankAccountId } : null, amount: payment.amount + reversals.reduce((n, r) => n + r.amount, 0), currency: payment.currency, receiptNo: payment.receiptNo, allocations: [...allocations].map(([invoiceId, minor]) => ({ invoiceId, minor })), unappliedMinor: credit,
        invoices: invoices.map(i => ({ id: i.id, total: i.totalAmount, paid: i.totalAmountPaid, balance: i.balanceDue, status: i.status, currency: i.currency })), carry: carry ? { id: carry.id, balance: carry.balance, currency: carry.currency } : null };
    return { kind, row: payment, label: `${payment.student.fullName} · ${payment.receiptNo ?? payment.id}`, version: contentHash(snapshot), snapshot };
}
export async function preview(tx: TxClient, user: AuthUser, proposal: Proposal) {
    await permit(user, proposal.kind, true);
    const loaded = await source(tx, user, proposal.kind, proposal.sourceId);
    if (loaded.version !== proposal.expectedVersion)
        throw new ApiError("The record changed. Reload the original and review your saved proposal again.", 409);
    let after: unknown;
    if (loaded.kind === "MARK" && "maximum" in loaded.snapshot) {
        const result = previewMarkCorrection({ id: loaded.row.id, version: 0, marksObtained: loaded.snapshot.marksObtained, isAbsent: loaded.snapshot.isAbsent, maximum: loaded.snapshot.maximum, publishedReportVersionId: loaded.snapshot.reports.find(r => r.publishedVersionId)?.publishedVersionId ?? null }, 0, { marksObtained: proposal.marksObtained!, isAbsent: proposal.isAbsent ?? false });
        after = { ...result.after, grade: proposal.isAbsent ? null : gradeForMark(proposal.marksObtained!, loaded.snapshot.maximum, loaded.snapshot.thresholds), requiresReportApproval: result.requiresReportApproval };
    }
    else if ("currency" in loaded.snapshot) {
        const s = loaded.snapshot;
        if (!s.ledger || s.ledger.currency !== s.currency)
            throw new ApiError("Original ledger posting needs reconciliation before correction", 409);
        const result = previewPaymentReversal({ id: loaded.row.id, version: 0, money: { minor: s.amount, currency: s.currency }, allocations: s.allocations, unappliedMinor: s.unappliedMinor }, 0, proposal.allocations ?? [], proposal.unappliedMinor ?? 0);
        if (result.unappliedMinor && (!s.carry || s.carry.currency !== s.currency || s.carry.balance > result.unappliedMinor))
            throw new ApiError("Unapplied credit has been consumed or needs reconciliation; it cannot be reversed here", 409);
        after = { ...result, invoices: result.allocations.map(a => { const i = s.invoices.find(i => i.id === a.invoiceId)!; if (i.status === "CANCELLED" || i.paid + i.balance !== i.total)
                throw new ApiError("Invoice requires reconciliation", 409); return { id: i.id, ...invoiceAfterReversal(i.total, i.paid, -a.minor) }; }) };
    }
    const policy = await tx.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { correctionSeparateApprover: true } });
    const result = { kind: proposal.kind, sourceId: proposal.sourceId, sourceVersion: loaded.version, before: loaded.snapshot, after, separateApprover: policy.correctionSeparateApprover };
    return { ...result, hash: contentHash(result), campusId: loaded.row.campusId, studentId: loaded.row.studentId };
}
export async function requestCorrection(user: AuthUser, proposal: Proposal, reviewHash: string, explanation: {
    reason: string;
    publicExplanation: string;
    privateNote?: string;
}) {
    const text = validateCorrectionRequest(explanation);
    return versionTransaction(async (tx) => {
        const p = await preview(tx, user, proposal);
        if (p.hash !== reviewHash)
            throw new ApiError("Review the current before/after preview before submitting", 409);
        const correction = await tx.correction.create({ data: { schoolId: user.schoolId, campusId: p.campusId, studentId: p.studentId, kind: p.kind, sourceId: p.sourceId, sourceVersion: p.sourceVersion, before: p.before as Prisma.InputJsonValue, after: p.after as Prisma.InputJsonValue, previewHash: p.hash, reason: text.reason, publicExplanation: text.publicExplanation, requesterId: user.userId, requesterName: user.fullName ?? user.role, separateApprover: p.separateApprover } });
        if (text.privateNote)
            await tx.correctionNote.create({ data: { schoolId: user.schoolId, campusId: p.campusId, correctionId: correction.id, text: text.privateNote } });
        return correction;
    });
}
export async function decideCorrection(user: AuthUser, id: string, decision: "APPLIED" | "REJECTED", reviewHash: string) {
    return versionTransaction(async (tx) => {
        const c = await tx.correction.findFirst({ where: { id, ...campusScope(user) } });
        if (!c)
            throw new ApiError("Correction unavailable", 403);
        await permit(user, c.kind as Kind, true, true);
        const policy = await tx.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { correctionSeparateApprover: true } });
        try {
            assertSeparateApprover(c.requesterId, user.userId, c.separateApprover || policy.correctionSeparateApprover);
        }
        catch {
            throw new ApiError("School policy requires a different approver", 403);
        }
        if (c.status !== "PENDING" || c.previewHash !== reviewHash)
            throw new ApiError("Review the pending correction before deciding", 409);
        let successorId: string | null = null;
        const reportVersionIds: string[] = [];
        if (decision === "APPLIED") {
            const current = await source(tx, user, c.kind as Kind, c.sourceId);
            if (current.version !== c.sourceVersion)
                throw new ApiError("The source changed. The request remains saved; create a fresh reviewed proposal.", 409);
            if (c.kind === "MARK" && "exam" in current.row) {
                const after = c.after as {
                    marksObtained: number;
                    isAbsent: boolean;
                };
                const thresholds = await thresholdsForClass(current.row.exam.classId, current.row.exam.academicYear, tx);
                await tx.mark.update({ where: { id: c.sourceId }, data: { marksObtained: after.marksObtained, isAbsent: after.isAbsent, grade: after.isAbsent ? null : gradeForMark(after.marksObtained, current.row.subject.totalMarks, thresholds), enteredBy: user.userId } });
                const reports = await tx.reportCard.findMany({ where: { studentId: c.studentId } });
                for (const report of reports) {
                    const v = await refreshVersion(tx, report.id);
                    await tx.reportVersion.update({ where: { id: v.id }, data: { correctionReason: c.publicExplanation } });
                    reportVersionIds.push(v.id);
                }
                successorId = `${c.sourceId}@${current.row.correctionVersion + 1}`;
            }
            else if ("invoice" in current.row && "currency" in current.snapshot) {
                const p = current.row;
                const a = c.after as unknown as {
                    reversal: {
                        minor: number;
                        currency: string;
                    };
                    allocations: {
                        invoiceId: string;
                        minor: number;
                    }[];
                    unappliedMinor: number;
                    invoices: {
                        id: string;
                        paidMinor: number;
                        balanceMinor: number;
                        status: "PAID" | "PARTIAL" | "PENDING";
                    }[];
                };
                await capturePaymentReceipt(tx, p.id);
                const receipt = await tx.payment.create({ data: { schoolId: c.schoolId, campusId: c.campusId, studentId: c.studentId, invoiceId: p.invoiceId, amount: a.reversal.minor, currency: p.currency, paymentDate: new Date(), paymentMethod: p.paymentMethod, receiptNo: `COR-${c.id}`, reversalOfId: p.id, recordedBy: user.userId, note: c.publicExplanation } });
                successorId = receipt.id;
                // Credit uses the receipt's originating invoice; each affected invoice
                // gets its own compensating allocation, including zero invoice credit.
                const entries = new Map(a.allocations.map(x => [x.invoiceId, x.minor]));
                if (!entries.has(p.invoiceId))
                    entries.set(p.invoiceId, 0);
                for (const [invoiceId, amount] of entries)
                    await tx.paymentAllocation.create({ data: { schoolId: c.schoolId, campusId: c.campusId, paymentId: receipt.id, invoiceId, amount, credit: invoiceId === p.invoiceId ? a.unappliedMinor : 0, currency: p.currency } });
                for (const i of a.invoices)
                    await tx.invoice.update({ where: { id: i.id }, data: { totalAmountPaid: i.paidMinor, balanceDue: i.balanceMinor, status: i.status } });
                if (a.unappliedMinor) {
                    const carry = current.snapshot.carry;
                    if (!carry || carry.balance > a.unappliedMinor)
                        throw new ApiError("Credit no longer available", 409);
                    await tx.feeCarryForward.update({ where: { id: carry.id }, data: { balance: { increment: -a.unappliedMinor } } });
                }
                const account = p.ledgerEntry?.accountId;
                if (!account)
                    throw new ApiError("Original payment is missing its ledger posting; reconcile first", 409);
                await tx.ledgerEntry.create({ data: { schoolId: c.schoolId, campusId: c.campusId, kind: "INCOME", sourceName: `Correction COR-${c.id}`, accountId: account, bankAccountId: p.ledgerEntry?.bankAccountId, paymentMethod: p.paymentMethod, date: new Date(), amount: a.reversal.minor, currency: p.currency, note: c.publicExplanation, paymentId: receipt.id, createdById: user.userId } });
                await capturePaymentReceipt(tx, receipt.id);
            }
        }
        return tx.correction.update({ where: { id }, data: { status: decision, approverId: user.userId, approverName: user.fullName ?? user.role, decidedAt: new Date(), successorId, reportVersionIds } });
    });
}
export async function history(user: AuthUser, kind: Kind) {
    await permit(user, kind);
    const children = await prisma.student.findMany({ where: studentScope(user), select: { id: true } });
    const rows = await prisma.correction.findMany({ where: { ...campusScope(user), kind, studentId: { in: children.map(x => x.id) }, ...(isFamily(user) ? { status: "APPLIED" } : {}) }, orderBy: { requestedAt: "desc" } });
    const output = [];
    for (const row of rows) {
        const versionIds = row.reportVersionIds as string[];
        const released = await correctionReleased(prisma, versionIds);
        if (isFamily(user)) {
            if (!released)
                continue;
            // Allowlist public fields. Payment before/after contain only this child's
            // amounts; internal reasons and private notes never enter this projection.
            output.push({ id: row.id, kind: row.kind, sourceId: row.sourceId, sourceVersion: row.sourceVersion, before: row.before, after: row.after, publicExplanation: row.publicExplanation, requesterName: row.requesterName, approverName: row.approverName, requestedAt: row.requestedAt, decidedAt: row.decidedAt, status: row.status, successorId: row.successorId, released });
        }
        else {
            // Teachers can only inspect records assigned to them.
            if (user.role === "TEACHER") {
                try {
                    await source(prisma, user, kind, row.sourceId);
                }
                catch {
                    continue;
                }
            }
            const note = await prisma.correctionNote.findUnique({ where: { correctionId: row.id } });
            output.push({ ...row, privateNote: note?.text ?? null, released, canApprove: (kind === "PAYMENT" || academic(user)) && (!row.separateApprover || row.requesterId !== user.userId) });
        }
    }
    return output;
}
export async function catalog(user: AuthUser, kind: Kind) {
    await permit(user, kind);
    if (isFamily(user))
        return [];
    const ids = kind === "MARK" ? await prisma.mark.findMany({ where: { ...campusScope(user), ...(user.role === "TEACHER" ? { OR: [{ subject: { teacherId: user.userId } }, { exam: { class: { classTeacherId: user.userId } } }] } : {}) }, select: { id: true }, take: 100 }) : await prisma.payment.findMany({ where: { ...campusScope(user), amount: { gt: 0 }, reversalOfId: null }, select: { id: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return Promise.all(ids.map(async ({ id }) => { const s = await source(prisma, user, kind, id); return { id, label: s.label, version: s.version, original: s.snapshot }; }));
}
