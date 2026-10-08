import { test } from "node:test";
import assert from "node:assert/strict";
import { previewPaymentReversal, invoiceAfterReversal, validateCorrectionRequest, assertSeparateApprover, familyCorrectionEvidence, previewDigest, CorrectionConflict } from "../../src/lib/corrections/domain";

for (const currency of ["PKR", "SAR", "AED", "KWD", "USD"]) {
  test(`${currency}: a partially allocated reversal conserves original units and keeps input unchanged`, () => {
    const original = { id: "receipt-1", version: 4, money: { minor: 100001, currency }, allocations: [{ invoiceId: "a", minor: 50000 }, { invoiceId: "b", minor: 30000 }], unappliedMinor: 20001 };
    const before = JSON.stringify(original);
    const preview = previewPaymentReversal(original, 4, [{ invoiceId: "a", minor: 20000 }, { invoiceId: "b", minor: 30000 }], 20001);
    assert.equal(preview.reversal.minor, -70001);
    assert.deepEqual(preview.remaining, { minor: 30000, currency });
    assert.equal(preview.allocations.reduce((n, a) => n + a.minor, preview.unappliedMinor), preview.reversal.minor);
    assert.equal(JSON.stringify(original), before);
    assert.deepEqual(invoiceAfterReversal(80000, 50000, 20000), { paidMinor: 30000, balanceMinor: 50000, status: "PARTIAL" });
    assert.deepEqual(invoiceAfterReversal(30000, 30000, 30000), { paidMinor: 0, balanceMinor: 30000, status: "PENDING" });
  });
}
const source = { id: "p", version: 2, money: { minor: 100, currency: "KWD" }, allocations: [{ invoiceId: "i", minor: 80 }], unappliedMinor: 20 };
test("stale version cannot commit a second proposal", () => assert.throws(() => previewPaymentReversal(source, 1, [], 20), CorrectionConflict));
test("oversized, duplicate, foreign, fractional and unreconciled allocations fail closed", () => {
  for (const allocations of [[{ invoiceId: "i", minor: 81 }], [{ invoiceId: "i", minor: 1 }, { invoiceId: "i", minor: 1 }], [{ invoiceId: "foreign", minor: 1 }], [{ invoiceId: "i", minor: 0.1 }]]) {
    assert.throws(() => previewPaymentReversal(source, 2, allocations, 0));
  }
  assert.throws(() => previewPaymentReversal({ ...source, unappliedMinor: 21 }, 2, [], 1));
  assert.throws(() => previewPaymentReversal(source, 2, [], 21));
  assert.throws(() => previewPaymentReversal(source, 2, [], 0));
});
test("preview digest changes with consequences or revision", () => {
  const first = previewPaymentReversal(source, 2, [], 1);
  const second = previewPaymentReversal(source, 2, [], 2);
  assert.notEqual(previewDigest(first), previewDigest(second));
  assert.notEqual(previewDigest(first), previewDigest({ ...first, sourceVersion: 3 }));
});
test("reason/public explanation are required and separate approval policy is enforced", () => {
  assert.throws(() => validateCorrectionRequest({ reason: "  ", publicExplanation: "Adjustment" }));
  assert.throws(() => validateCorrectionRequest({ reason: "Correction", publicExplanation: "  " }));
  assert.throws(() => assertSeparateApprover("a", "a", true));
  assert.doesNotThrow(() => assertSeparateApprover("a", "b", true));
  assert.doesNotThrow(() => assertSeparateApprover("a", "a", false));
});
test("family history excludes reasons/private notes and rejected proposals", () => {
  const evidence = { id: "c", sourceId: "p", successorId: "r", status: "APPLIED", before: 100, after: 90, reason: "PRIVATE_REASON", privateNote: "PRIVATE_NOTE", publicExplanation: "Amount corrected", requesterName: "Staff", approverName: "Reviewer", requestedAt: "2026-10-08", approvedAt: "2026-10-08" };
  const publicJson = JSON.stringify(familyCorrectionEvidence(evidence));
  assert(!publicJson.includes("PRIVATE"));
  assert(publicJson.includes("Amount corrected"));
  assert.equal(familyCorrectionEvidence({ ...evidence, status: "REJECTED" }), null);
});

test("published grade preview preserves release reference and requires renewed approval", async () => {
  const { previewMarkCorrection } = await import("../../src/lib/corrections/domain");
  const original = { id: "m", version: 7, marksObtained: 60, isAbsent: false, maximum: 100, publishedReportVersionId: "published-3" };
  const result = previewMarkCorrection(original, 7, { marksObtained: 65, isAbsent: false });
  assert.equal(result.originalPublishedVersionId, "published-3");
  assert.equal(result.requiresReportApproval, true);
  assert.equal(result.before.marksObtained, 60);
  assert.equal(result.after.marksObtained, 65);
  assert.equal(original.marksObtained, 60);
  assert.throws(() => previewMarkCorrection({ ...original, version: 8 }, 7, { marksObtained: 65, isAbsent: false }), CorrectionConflict);
  assert.throws(() => previewMarkCorrection(original, 7, { marksObtained: 101, isAbsent: false }));
  assert.throws(() => previewMarkCorrection(original, 7, { marksObtained: 60, isAbsent: false }));
  assert.throws(() => previewMarkCorrection(original, 7, { marksObtained: 5, isAbsent: true }));
});
