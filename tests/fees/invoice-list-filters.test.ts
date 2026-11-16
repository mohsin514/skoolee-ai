import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInvoiceListFilters } from "../../src/lib/fees/invoice-list-filters";

// SKAI-380 AC4: invalid list filters are rejected with field errors (400), never passed to Prisma.
test("accepts known statuses and YYYY-MM months", () => {
  const result = parseInvoiceListFilters(new URLSearchParams("status=PARTIAL&month=2026-03"));
  assert.deepEqual(result, { ok: true, status: "PARTIAL", month: "2026-03" });
});

test("empty filters mean no filter", () => {
  assert.deepEqual(parseInvoiceListFilters(new URLSearchParams("status=&month=")), { ok: true, status: null, month: null });
  assert.deepEqual(parseInvoiceListFilters(new URLSearchParams("")), { ok: true, status: null, month: null });
});

test("rejects an unknown status with a field error", () => {
  const result = parseInvoiceListFilters(new URLSearchParams("status=BOGUS"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.fieldErrors.status?.length);
});

test("rejects malformed and out-of-range months", () => {
  for (const month of ["2026-13", "2026-00", "03-2026", "2026-3", "BOGUS", "2026-03-01"]) {
    const result = parseInvoiceListFilters(new URLSearchParams(`month=${month}`));
    assert.equal(result.ok, false, month);
    if (!result.ok) assert.ok(result.fieldErrors.month?.length, month);
  }
});

test("reports both bad fields together", () => {
  const result = parseInvoiceListFilters(new URLSearchParams("status=X&month=Y"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["month", "status"]);
});
