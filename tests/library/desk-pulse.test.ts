import { test } from "node:test";
import assert from "node:assert/strict";
import { deskPulse } from "@/lib/library/desk-pulse";

// SKAI-561: the lending desk tiles reconcile with the copies — a copy on the hold shelf is "ready to collect", not "on loan".
const books = [{ copiesTotal: 2, copiesAvailable: 0 }, { copiesTotal: 3, copiesAvailable: 2 }];

test("a copy held for a reservation is counted once, as ready to collect", () => {
  // Title 1: one copy on loan, one held for a READY reservation. Title 2: one on loan, two on the shelf.
  assert.deepEqual(deskPulse(books, [{ status: "READY" }, { status: "WAITING" }]), { shelf: 2, onLoan: 2, ready: 1 });
});

test("with no holds, everything off the shelf is on loan", () => {
  assert.deepEqual(deskPulse(books, []), { shelf: 2, onLoan: 3, ready: 0 });
});

test("on loan never goes below zero", () => {
  assert.deepEqual(deskPulse([{ copiesTotal: 1, copiesAvailable: 1 }], [{ status: "READY" }]), { shelf: 1, onLoan: 0, ready: 1 });
});
