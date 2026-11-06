import { test } from "node:test";
import assert from "node:assert/strict";
import { salaryChangeDetail } from "../../src/lib/staff/salary-detail";
import { defaultLocale } from "../../src/lib/locale/package";

// SKAI-128: the staff timeline wrote "Rs." for every school while the staff card used the school currency.
test("salary change detail uses the school currency, not a hard-coded Rs.", () => {
  const usd = salaryChangeDetail(0, 8_500_000, { ...defaultLocale, currency: "USD" });
  assert.equal(usd, "$0.00 → $85,000.00");
  assert.doesNotMatch(usd, /Rs\./);
  const aed = salaryChangeDetail(100_000, 250_000, { ...defaultLocale, currency: "AED" });
  assert.match(aed, /AED/);
  assert.doesNotMatch(aed, /Rs\./);
});

test("salary change detail keeps PKR schools in rupees", () => {
  assert.match(salaryChangeDetail(0, 8_500_000, { ...defaultLocale, currency: "PKR" }), /Rs|PKR/);
});
