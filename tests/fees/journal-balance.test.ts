import { test } from "node:test";
import assert from "node:assert/strict";
import { assertBalancedJournal, UnbalancedJournalError } from "../../src/lib/fees/journal-balance";

test("a balanced two-line journal passes", () => {
  assert.doesNotThrow(() => assertBalancedJournal([
    { accountId: "bank", side: "DEBIT", amount: 1500 },
    { accountId: "fees", side: "CREDIT", amount: 1500 },
  ]));
});

test("a multi-line journal balances on the totals, not per line", () => {
  assert.doesNotThrow(() => assertBalancedJournal([
    { accountId: "bank", side: "DEBIT", amount: 1000 },
    { accountId: "bank", side: "DEBIT", amount: 500 },
    { accountId: "fees", side: "CREDIT", amount: 1200 },
    { accountId: "tax", side: "CREDIT", amount: 300 },
  ]));
});

test("a single-sided posting is rejected", () => {
  assert.throws(() => assertBalancedJournal([{ accountId: "expense", side: "DEBIT", amount: 12345 }]), UnbalancedJournalError);
  assert.throws(() => assertBalancedJournal([
    { accountId: "expense", side: "DEBIT", amount: 12345 },
    { accountId: "other", side: "DEBIT", amount: 12345 },
  ]), /needs both a debit and a credit/);
});

test("unequal debits and credits are rejected with both totals", () => {
  assert.throws(() => assertBalancedJournal([
    { accountId: "bank", side: "DEBIT", amount: 1000 },
    { accountId: "fees", side: "CREDIT", amount: 999 },
  ]), /debits 1000, credits 999/);
});

test("zero, negative, fractional or unsafe amounts are rejected", () => {
  for (const amount of [0, -5, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
    assert.throws(() => assertBalancedJournal([
      { accountId: "bank", side: "DEBIT", amount },
      { accountId: "fees", side: "CREDIT", amount: 1 },
    ]), UnbalancedJournalError);
  }
});

test("a journal with fewer than two lines is rejected", () => {
  assert.throws(() => assertBalancedJournal([]), /at least two lines/);
});
