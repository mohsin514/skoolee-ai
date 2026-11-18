import assert from "node:assert/strict";
import test from "node:test";
import { reviseDocumentForCredit } from "@/lib/tax/service";
// SKAI-2261: a credit note or waiver on a taxed invoice recomputes VAT from the issued lines and revises the document.
function fakeDb(doc: Record<string, unknown> | null) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const db = {
    taxDocument: { findFirst: async ({ where }: { where: { schoolId: string } }) => (doc && where.schoolId === doc.schoolId ? doc : null), update: async (args: { where: unknown; data: Record<string, unknown> }) => { updates.push(args); return args; } },
    taxActivation: { findFirst: async () => ({ exemptFeeCodes: [] }) },
  };
  return { db: db as never, updates };
}
const issued = {
  id: "doc-1", schoolId: "school-a", invoiceId: "inv-1", activationId: "act-1", packageCode: "SA-DEMO", packageVersion: 1, documentNumber: "SAD-000002",
  revision: 1, taxAmount: 65003, totalAmount: 498353, submissionStatus: "ACCEPTED",
  snapshot: { lines: [{ code: "TUITION", name: "Monthly fee", amount: 333300 }, { code: "LAB", name: "Lab fee", amount: 100050 }], discount: 0, tax: 65003, total: 498353 },
};
test("SKAI-2261: VAT follows the taxable amount after a credit note, and the previous figures are kept", async () => {
  const { db, updates } = fakeDb(issued);
  const r = await reviseDocumentForCredit(db, "school-a", "inv-1", 100050, { adjustmentId: "adj-1", kind: "CREDIT_NOTE", amount: 100050, by: "user-1" });
  assert.deepEqual(r, { tax: 49995, total: 383295, documentNumber: "SAD-000002", revision: 2 });
  const data = updates[0].data as { revision: number; taxAmount: number; totalAmount: number; submissionStatus?: string; snapshot: { credits: Array<{ previous: { tax: number } }> } };
  assert.equal(data.taxAmount, 49995);
  assert.equal(data.totalAmount, 383295);
  assert.equal(data.submissionStatus, "CORRECTED", "an accepted document is queued for resend");
  assert.equal(data.snapshot.credits[0].previous.tax, 65003);
});
test("SKAI-2261: no tax document (or another school's) means no revision", async () => {
  assert.equal(await reviseDocumentForCredit(fakeDb(null).db, "school-a", "inv-1", 100, { adjustmentId: "a", kind: "WAIVER", amount: 100, by: "u" }), null);
  assert.equal(await reviseDocumentForCredit(fakeDb(issued).db, "school-b", "inv-1", 100, { adjustmentId: "a", kind: "WAIVER", amount: 100, by: "u" }), null);
});
test("SKAI-2261: a reduction larger than the fees is refused", async () => {
  await assert.rejects(reviseDocumentForCredit(fakeDb(issued).db, "school-a", "inv-1", 433351, { adjustmentId: "a", kind: "WAIVER", amount: 433351, by: "u" }), /larger than the fees/);
});
