import { test } from "node:test";
import assert from "node:assert/strict";
import { replayedAdjustment } from "@/lib/fees/adjustments-service";

// SKAI-1535: a reused key with changed reason, explanation or private note is a 409, not a silent replay.
const stored = { kind: "REFUND", invoiceId: "inv-qa01", paymentId: "pay-qa01", amount: 500, reasonCategory: "OVERPAYMENT", reason: "Paid twice", publicExplanation: "We are returning the second payment.", privateNote: null };
const input = { kind: "REFUND" as const, invoiceId: "inv-qa01", paymentId: "pay-qa01", amount: 500, reasonCategory: "OVERPAYMENT", reason: "  Paid twice ", publicExplanation: "We are returning the second payment.", privateNote: "  " };

for (const kind of ["REFUND", "CREDIT_NOTE", "WAIVER"] as const) {
  test(`${kind}: an exact retry (after trimming) replays`, () => {
    const previous = { ...stored, kind };
    assert.equal(replayedAdjustment(previous, { ...input, kind }), previous);
  });
}

for (const [field, value] of [["reason", "Different reason"], ["publicExplanation", "Different family text"], ["privateNote", "A new note"]] as const) {
  test(`a changed ${field} is rejected with 409`, () => {
    assert.throws(() => replayedAdjustment(stored, { ...input, [field]: value }), (e: { status?: number }) => e.status === 409);
  });
}
