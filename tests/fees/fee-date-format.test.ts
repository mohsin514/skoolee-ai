import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDate } from "../../src/components/fees/fee-utils";

// SKAI-1398: date-only fee dates must keep their calendar day in every viewer timezone.
test("date-only values keep their calendar day west of UTC", () => {
  assert.equal(formatDate("2026-03-01T00:00:00.000Z"), "Mar 01, 2026");
  assert.equal(formatDate("2026-11-01T00:00:00.000Z"), "Nov 01, 2026");
  assert.equal(formatDate("2026-03-01"), "Mar 01, 2026");
});
