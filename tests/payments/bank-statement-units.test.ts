import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1286: a CSV bank row in rupees (20.00) is compared with invoice balances in paisa (2000)
// in both importers, so an exact payment is linked to its invoice instead of left unmatched.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
const invoices = [
  { id: "inv-saba", invoiceNumber: "INV-SB-1", balanceDue: 2000, student: { id: "stu-1", fullName: "Saba Bhatti", guardianName: null } },
  { id: "inv-big", invoiceNumber: "INV-ZZ-9", balanceDue: 900000, student: { id: "stu-2", fullName: "Synthetic Other", guardianName: null } },
];
type StagedRow = { state: string; proposal: { amountMinor: number; matchedInvoiceId: string | null; candidates: { id: string }[] } };
let staged: { rows: StagedRow[] } | null = null;
let reconciliation: { reconciliationDetailsJson: { matchedInvoiceId: string; amountMinor: number; rowNumber: number }[]; unmatchedJson: unknown[] } | null = null;
const prisma = {
  invoice: { findMany: async () => invoices },
  bankTransactionKey: { findMany: async () => [] },
  bankReconciliation: { create: async ({ data }: { data: typeof reconciliation }) => { reconciliation = data; return { id: "rec-1" }; } },
};
class ApiError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(src("lib/permissions.ts"), { namedExports: { assertPermission: async () => undefined } });
mock.module(src("lib/api/scope.ts"), { namedExports: {
  ApiError, requireAuthUser: async () => ({ userId: "u-1", schoolId: "school-a", role: "CAMPUS_ADMIN" }),
  assertStaffRole: () => undefined, assertPermission: async () => undefined, canManageCampusOps: () => true,
  resolveCampusId: async () => "campus-a", errorResponse: (error: Error) => Response.json({ error: error.message }, { status: 500 }),
} });
mock.module(src("lib/imports/roster-access.ts"), { namedExports: { assertRosterPermission: async () => undefined } });
mock.module(src("lib/imports/stage-batch-command.ts"), { namedExports: {
  MAX_IMPORT_ROWS: 1000, classifyStudentRoster: async () => { throw new Error("not expected"); }, csvRosterSources: () => [],
  expireStagedBatches: async () => undefined, importBatchView: (batch: unknown) => batch,
  persistImportBatch: async (_user: unknown, input: typeof staged) => { staged = input; return { batch: input, created: true }; },
} });

test("staged import: a rupee row with the invoice reference links its paisa invoice; the exact balance ranks first", async () => {
  const { POST } = await import("../../src/app/api/import-batches/route");
  const csvText = "date,amount,description\n2026-10-30,20.00,Fee INV-SB-1 Xaba Bhatti\n2026-10-30,20.00,Xaba Bhatti\n";
  const res = await POST(new Request("http://localhost/api/import-batches", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "BANK_STATEMENT", sourceName: "oct.csv", csvText, accountName: "Synthetic Main", currency: "PKR", statementFrom: "2026-10-01", statementTo: "2026-10-31", campusId: "campus-a" }) }) as never);
  assert.equal(res.status, 201);
  const [referenced, nameOnly] = staged!.rows;
  assert.equal(referenced.proposal.amountMinor, 2000, "Rs 20.00 is 2000 paisa");
  assert.equal(referenced.proposal.matchedInvoiceId, "inv-saba");
  assert.equal(referenced.state, "ACCEPTED");
  assert.equal(nameOnly.proposal.matchedInvoiceId, null, "a name alone never auto-matches here");
  assert.equal(nameOnly.proposal.candidates[0].id, "inv-saba", "the exact-amount invoice is the first candidate");
});

test("job import (the ticket's fixture): Rs 20 'Xaba Bhatti' matches Saba Bhatti's 2000-paisa invoice", async () => {
  const { processBankImport } = await import("../../src/lib/jobs/bank-import");
  const form = new FormData();
  form.set("file", new File(["date,amount,description\n2026-10-30,20.00,Xaba Bhatti\n"], "oct.csv", { type: "text/csv" }));
  for (const [key, value] of Object.entries({ currency: "PKR", accountName: "Synthetic Main", statementFrom: "2026-10-01", statementTo: "2026-10-31", campusId: "campus-a" })) form.set(key, value);
  const res = await processBankImport({ userId: "u-1", schoolId: "school-a", role: "CAMPUS_ADMIN" } as never, form, prisma as never);
  const body = await res.json();
  assert.deepEqual([body.data.matched, body.data.unmatched], [1, 0]);
  assert.equal(reconciliation!.reconciliationDetailsJson[0].matchedInvoiceId, "inv-saba");
  assert.equal(body.data.preview[0].amount, 2000);
});
