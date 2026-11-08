import { createHash } from "node:crypto";
/** Domain rules shared by preview and commit. Persist the returned evidence
 * append-only; the caller must lock/reload source rows in its transaction. */
export class CorrectionConflict extends Error {
    readonly status = 409;
    constructor() { super("The record changed. Review your saved proposal against the current values."); }
}
export type OriginalMoney = Readonly<{
    minor: number;
    currency: string;
}>;
export type Allocation = Readonly<{
    invoiceId: string;
    minor: number;
}>;
export type PaymentSource = Readonly<{
    id: string;
    version: number;
    money: OriginalMoney;
    allocations: readonly Allocation[];
    unappliedMinor: number;
}>;
export type PaymentReversal = Readonly<{
    sourceId: string;
    sourceVersion: number;
    original: OriginalMoney;
    reversal: OriginalMoney;
    allocations: readonly Allocation[];
    unappliedMinor: number;
    remaining: OriginalMoney;
}>;
const supportedCurrencies = new Set(["PKR", "SAR", "AED", "KWD", "USD"]);
function integer(value: number, label: string) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${label} must be a nonnegative safe integer in original minor units`);
}
function money(value: OriginalMoney) {
    integer(value.minor, "Amount");
    if (!supportedCurrencies.has(value.currency))
        throw new Error("Unsupported original currency");
}
function sum(values: readonly number[]) {
    const result = values.reduce((a, b) => a + b, 0);
    integer(result, "Total");
    return result;
}
/** The requester explicitly chooses the affected allocations. No guessed FIFO
 * accounting and no exchange-rate conversion. Negative postings are emitted
 * only after validating conservation of the original receipt's minor units. */
export function previewPaymentReversal(source: PaymentSource, expectedVersion: number, allocationReversals: readonly Allocation[], unappliedReversalMinor: number): PaymentReversal {
    if (source.version !== expectedVersion)
        throw new CorrectionConflict();
    money(source.money);
    integer(source.unappliedMinor, "Unapplied amount");
    const existing = new Map<string, number>();
    for (const allocation of source.allocations) {
        integer(allocation.minor, "Allocation");
        if (!allocation.invoiceId || existing.has(allocation.invoiceId))
            throw new Error("Duplicate or missing original invoice allocation");
        existing.set(allocation.invoiceId, allocation.minor);
    }
    if (sum([...existing.values(), source.unappliedMinor]) !== source.money.minor)
        throw new Error("Original payment allocations do not reconcile");
    integer(unappliedReversalMinor, "Unapplied reversal");
    if (unappliedReversalMinor > source.unappliedMinor)
        throw new Error("Reversal exceeds unapplied credit");
    const seen = new Set<string>();
    for (const allocation of allocationReversals) {
        integer(allocation.minor, "Allocation reversal");
        if (seen.has(allocation.invoiceId))
            throw new Error("Duplicate invoice reversal");
        seen.add(allocation.invoiceId);
        const available = existing.get(allocation.invoiceId);
        if (available === undefined || allocation.minor > available)
            throw new Error("Reversal exceeds the original invoice allocation");
    }
    const minor = sum([...allocationReversals.map(a => a.minor), unappliedReversalMinor]);
    if (!minor)
        throw new Error("Reversal must be greater than zero");
    return Object.freeze({ sourceId: source.id, sourceVersion: source.version,
        original: Object.freeze({ ...source.money }), reversal: Object.freeze({ minor: -minor, currency: source.money.currency }),
        allocations: Object.freeze(allocationReversals.map(a => Object.freeze({ invoiceId: a.invoiceId, minor: -a.minor }))),
        unappliedMinor: -unappliedReversalMinor,
        remaining: Object.freeze({ minor: source.money.minor - minor, currency: source.money.currency }),
    });
}
export function invoiceAfterReversal(totalMinor: number, paidMinor: number, reversalMinor: number) {
    integer(totalMinor, "Invoice total");
    integer(paidMinor, "Invoice paid");
    integer(reversalMinor, "Reversal");
    if (paidMinor > totalMinor || reversalMinor > paidMinor)
        throw new Error("Invoice allocation does not reconcile");
    const paid = paidMinor - reversalMinor;
    return { paidMinor: paid, balanceMinor: totalMinor - paid, status: paid === totalMinor ? "PAID" : paid ? "PARTIAL" : "PENDING" };
}
export function validateCorrectionRequest(input: {
    reason: string;
    publicExplanation: string;
    privateNote?: string;
}) {
    const reason = input.reason.trim();
    const publicExplanation = input.publicExplanation.trim();
    if (!reason || reason.length > 2000)
        throw new Error("A reason of 1–2000 characters is required");
    if (!publicExplanation || publicExplanation.length > 2000)
        throw new Error("A public explanation of 1–2000 characters is required");
    if ((input.privateNote?.length ?? 0) > 4000)
        throw new Error("Private note exceeds 4000 characters");
    return { reason, publicExplanation, privateNote: input.privateNote?.trim() || null };
}
export function assertSeparateApprover(requesterId: string, approverId: string, required: boolean) {
    if (!requesterId || !approverId)
        throw new Error("Authenticated requester and approver are required");
    if (required && requesterId === approverId)
        throw new Error("School policy requires a different approver");
}
/** Stable evidence digest binds a reviewed preview to its exact source revision
 * and consequences; authorization remains a separate server-side decision. */
export function previewDigest(preview: PaymentReversal) {
    return createHash("sha256").update(JSON.stringify({ ...preview,
        allocations: [...preview.allocations].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId)),
    })).digest("hex");
}
export type CorrectionEvidence = {
    id: string;
    sourceId: string;
    successorId: string | null;
    status: string;
    before: unknown;
    after: unknown;
    publicExplanation: string;
    requestedAt: string;
    approvedAt: string | null;
    requesterName: string;
    approverName: string | null;
    reason: string;
    privateNote: string | null;
};
/** Explicit allowlist: never serialize a database row into family history. */
export function familyCorrectionEvidence(evidence: CorrectionEvidence) {
    if (evidence.status !== "APPLIED")
        return null;
    return { id: evidence.id, sourceId: evidence.sourceId, successorId: evidence.successorId,
        before: evidence.before, after: evidence.after, publicExplanation: evidence.publicExplanation,
        requestedAt: evidence.requestedAt, approvedAt: evidence.approvedAt,
        requesterName: evidence.requesterName, approverName: evidence.approverName };
}
export type MarkSource = Readonly<{
    id: string;
    version: number;
    marksObtained: number;
    isAbsent: boolean;
    maximum: number;
    publishedReportVersionId: string | null;
}>;
export function previewMarkCorrection(source: MarkSource, expectedVersion: number, proposed: {
    marksObtained: number;
    isAbsent: boolean;
}) {
    if (source.version !== expectedVersion)
        throw new CorrectionConflict();
    integer(source.maximum, "Maximum marks");
    integer(source.marksObtained, "Original marks");
    integer(proposed.marksObtained, "Proposed marks");
    if (source.maximum === 0 || source.marksObtained > source.maximum || proposed.marksObtained > source.maximum)
        throw new Error("Marks must be within the subject maximum");
    if (proposed.isAbsent && proposed.marksObtained !== 0)
        throw new Error("An absent result cannot include awarded marks");
    if (source.marksObtained === proposed.marksObtained && source.isAbsent === proposed.isAbsent)
        throw new Error("The correction must change the result");
    return Object.freeze({ sourceId: source.id, sourceVersion: source.version,
        before: Object.freeze({ marksObtained: source.marksObtained, isAbsent: source.isAbsent, maximum: source.maximum }),
        after: Object.freeze({ ...proposed, maximum: source.maximum }),
        originalPublishedVersionId: source.publishedReportVersionId,
        requiresReportApproval: source.publishedReportVersionId !== null,
    });
}
