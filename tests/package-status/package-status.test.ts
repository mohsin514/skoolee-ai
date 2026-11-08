import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPackageAmount, packageStatus } from "../../src/lib/billing/package-status";

const now = new Date("2026-10-30T10:00:00Z");

test("pending choices name who acts next", () => {
  assert.deepEqual(packageStatus({ status: "PENDING_SETTLEMENT", provider: "SALES_ASSISTED" }, null, now), { key: "reserved", next: "track" });
  assert.deepEqual(packageStatus({ status: "PENDING_SETTLEMENT", provider: "BANK_TRANSFER" }, null, now), { key: "bank", next: "track" });
  assert.deepEqual(packageStatus({ status: "PENDING_SETTLEMENT", provider: "PAY_LATER" }, null, now), { key: "due", next: "pay" });
  assert.deepEqual(packageStatus({ status: "CHECKOUT_PENDING", provider: "SAFEPAY" }, null, now), { key: "checkout", next: "track" });
  assert.deepEqual(packageStatus({ status: "CUSTOM_QUOTE", provider: "SALES_ASSISTED" }, null, now), { key: "requested", next: "track" });
});

test("failed and cancelled checkouts ask for a new choice", () => {
  assert.equal(packageStatus({ status: "FAILED", provider: "SAFEPAY" }, null, now).next, "choose");
  assert.equal(packageStatus({ status: "CANCELLED", provider: "SAFEPAY" }, null, now).key, "cancelled");
});

test("an active package follows the school's lifecycle into grace and expiry", () => {
  const paid = { status: "SETTLED", provider: "SAFEPAY" };
  assert.equal(packageStatus(paid, { status: "ACTIVE", lifecycleState: "ACTIVE" }, now).key, "active");
  assert.equal(packageStatus({ status: "FREE_SELECTED", provider: "NONE" }, null, now).key, "active");
  assert.deepEqual(packageStatus(paid, { status: "ACTIVE", lifecycleState: "PAST_DUE_GRACE", graceEndsAt: "2026-11-01T00:00:00Z" }, now), { key: "grace", next: "renew" });
  assert.equal(packageStatus(paid, { status: "ACTIVE", lifecycleState: "APPROVED_GRACE", graceEndsAt: new Date("2026-11-02") }, now).key, "grace");
  // Boundary: grace that ended is expiry, even before the cron suspends the school.
  assert.equal(packageStatus(paid, { status: "ACTIVE", lifecycleState: "PAST_DUE_GRACE", graceEndsAt: now }, now).key, "expired");
  assert.equal(packageStatus(paid, { status: "SUSPENDED", lifecycleState: "PAST_DUE" }, now).key, "expired");
});

test("lifecycle never upgrades a choice that is not active", () => {
  assert.equal(packageStatus({ status: "PENDING_SETTLEMENT", provider: "BANK_TRANSFER" }, { status: "SUSPENDED", lifecycleState: "PAST_DUE" }, now).key, "bank");
});

test("amounts follow the reader's language and the catalogue currency", () => {
  assert.equal(formatPackageAmount(15000, "PKR", "en"), new Intl.NumberFormat("en", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(15000));
  assert.notEqual(formatPackageAmount(15000, "PKR", "ar"), formatPackageAmount(15000, "PKR", "en"));
  assert.equal(formatPackageAmount(1200, null, "en"), "1,200");
  assert.match(formatPackageAmount(10, "NOTACURRENCY", "en"), /NOTACURRENCY/);
});
