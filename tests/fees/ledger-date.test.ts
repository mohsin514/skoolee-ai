import assert from "node:assert/strict";
import { test } from "node:test";
import { ledgerDay as day } from "@/lib/fees/ledger-service";

test("manual ledger dates must exist on the calendar", () => {
  assert.equal(day("2026-03-02", false)?.toISOString(), "2026-03-02T00:00:00.000Z");
  assert.throws(() => day("2026-02-30", false), { message: "Invalid date" });
  assert.throws(() => day("2026-13-01", false), { message: "Invalid date" });
});
