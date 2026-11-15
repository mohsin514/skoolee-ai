import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";

// SKAI-1443: a manual collection posts in one transaction, and same-key retries queue on one advisory lock.
const source = readFileSync("src/lib/fees/collect-command.ts", "utf8");
const core = source.slice(source.indexOf("export async function collectPaymentCore"));

test("SKAI-1443: the replay check, hand-off binding and payment write share one transaction on the same client", () => {
  const tx = core.slice(core.indexOf("prisma.$transaction(async (tx) => {"), core.indexOf("{ timeout: 20000 }"));
  assert.match(tx, /pg_advisory_xact_lock\(hashtext\(/);
  assert.match(tx, /const winner = await replay\(tx\);/);
  assert.match(tx, /await bindHandoff\(tx, user,/);
  assert.match(tx, /await recordPayment\(tx, \{/);
  assert.match(tx, /await tx\.auditLog\.create/);
});

test("SKAI-1443: no outer-client query runs while the transaction holds its connection", () => {
  const tx = core.slice(core.indexOf("prisma.$transaction(async (tx) => {"), core.indexOf("{ timeout: 20000 }"));
  assert.doesNotMatch(tx.replace("prisma.$transaction(", ""), /\bprisma\./);
});

test("SKAI-1443: the advisory lock is taken before the replay check", () => {
  const tx = core.slice(core.indexOf("prisma.$transaction(async (tx) => {"));
  assert.ok(tx.indexOf("pg_advisory_xact_lock") < tx.indexOf("replay(tx)"));
});

test("SKAI-2053: a duplicate payment reference is a 409 and the form no longer pre-fills the invoice number", () => {
  assert.match(core, /\/reference\/i\.test\(target\)\) throw conflict\(.*DUPLICATE_PAYMENT_REFERENCE/);
  const ui = readFileSync("src/components/fees/FeePaymentsTab.tsx", "utf8");
  assert.doesNotMatch(ui, /setReferenceNumber\([^)]*invoiceNumber/);
});

// SKAI-2050: a collection cannot be dated after today in the school timezone.
test("SKAI-2050: the collect command refuses a payment date after the school's today", () => {
  assert.match(core, /const today = await schoolToday\(user\.schoolId, campusId\);/);
  assert.match(core, /paymentDate\.toISOString\(\)\.slice\(0, 10\) > today/);
  assert.match(core, /The payment date cannot be in the future\./);
  assert.ok(core.indexOf("schoolToday(") < core.indexOf("prisma.$transaction("));
});

// SKAI-2069: the default payment date is the school's calendar day, not the UTC date.
test("SKAI-2069: an omitted paymentDate defaults to schoolToday and the form pre-fills the school's day", () => {
  assert.doesNotMatch(core, /new Date\(\)\.toISOString\(\)/);
  assert.match(core, /const paymentDate = paymentDateInput \?\? calendarDate\(today\)!;/);
  const ui = readFileSync("src/components/fees/FeePaymentsTab.tsx", "utf8");
  const modal = ui.slice(ui.indexOf("function PaymentModal"));
  assert.match(modal, /calendarDateIn\(schoolTimeZone\)/);
  assert.match(modal, /useState\(todayInSchool\)/);
  assert.doesNotMatch(modal, /new Date\(\)\.toISOString\(\)\.split/);
});
