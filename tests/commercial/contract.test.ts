import assert from "node:assert/strict";
import test from "node:test";
import { COMMERCIAL_CONTRACT, createPlanContract, decodePlanContractMetadata, encodePlanContractMetadata, getSchoolPlanContract, validateCommercialContract } from "@/config/commercial-contract";
import { PLANS, PLAN_ORDER, annualMonthlyPrice } from "@/config/plans";
import { currencyForCountry, defaultPricingCurrency } from "@/lib/locale/country";
import { stripePriceMismatch } from "@/lib/stripe/server";
import { creditResetMonthKey, resetCreditUsage } from "@/lib/billing/credit-policy";

test("versioned commercial catalogue has no entitlement or credit reset drift", () => {
  assert.match(COMMERCIAL_CONTRACT.version, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.deepEqual(validateCommercialContract(), []);
  assert.equal(COMMERCIAL_CONTRACT.aiCredits.unused, "expire-at-calendar-month-reset");
});

test("marketing limits are the same values enforced for every plan", () => {
  for (const key of PLAN_ORDER) {
    const plan = PLANS[key];
    assert.equal(COMMERCIAL_CONTRACT.plans[key].maxStudents, plan.maxStudents);
    assert.equal(COMMERCIAL_CONTRACT.plans[key].maxTeachers, plan.maxTeachers);
    assert.equal(COMMERCIAL_CONTRACT.plans[key].maxCampuses, plan.maxCampuses);
    assert.equal(COMMERCIAL_CONTRACT.plans[key].aiCredits, plan.aiCredits);
  }
});

test("an existing school retains its approved limits and features after catalogue changes", () => {
  const saved = createPlanContract("BASIC", { effectiveAt: new Date("2026-09-01T00:00:00Z") });
  const schoolTerms = getSchoolPlanContract("BASIC", saved);
  assert.equal(schoolTerms.contractVersion, COMMERCIAL_CONTRACT.version);
  assert.equal(schoolTerms.maxStudents, 500);
  assert.equal(schoolTerms.maxTeachers, 10);
  assert.equal(schoolTerms.aiCredits, 1000);
  assert.equal(schoolTerms.whatsappEnabled, true);
  assert.equal(schoolTerms.priceCurrency, "PKR");
});

test("an open checkout keeps its quoted price, limits, and feature flags", () => {
  const quote = createPlanContract("BASIC", {
    catalogVersion: "2026-09-01.2",
    effectiveAt: new Date("2026-09-01T00:00:00.000Z"),
    price: 4500,
    priceLabel: "PKR 4,500/mo",
    maxStudents: 600,
    whatsappEnabled: false,
    features: ["600 students", "1000 AI credits/month"],
  });
  const metadata = encodePlanContractMetadata(quote);
  const restored = decodePlanContractMetadata(metadata, "BASIC");
  assert.deepEqual(restored, quote);
  assert.equal(decodePlanContractMetadata(metadata, "PRO"), null);
  assert.equal(decodePlanContractMetadata("not-json", "BASIC"), null);
});

test("regional currency defaults preserve their identity without converting PKR prices", () => {
  assert.deepEqual(
    Object.fromEntries(["PK", "SA", "AE", "KW", "OTHER"].map((country) => [country, defaultPricingCurrency(country as "PK" | "SA" | "AE" | "KW" | "OTHER")])),
    { PK: "PKR", SA: "SAR", AE: "AED", KW: "KWD", OTHER: "USD" }
  );
  assert.equal(currencyForCountry("AE"), "AED");
  assert.equal(COMMERCIAL_CONTRACT.currency, "PKR");
  assert.equal(annualMonthlyPrice(4000), 3200);
});

test("Stripe price release check accepts matching periods and blocks mismatches", () => {
  const annual = { active: true, currency: "pkr", unit_amount: 3_840_000, recurring: { interval: "year", interval_count: 1 } };
  assert.equal(stripePriceMismatch(annual, "BASIC", "annual", 4000), null);
  assert.match(stripePriceMismatch({ ...annual, unit_amount: 400_000 }, "BASIC", "annual", 4000) || "", /does not match/);
  assert.match(stripePriceMismatch({ ...annual, currency: "usd" }, "BASIC", "annual", 4000) || "", /does not match/);
  assert.match(stripePriceMismatch({ ...annual, recurring: { interval: "month", interval_count: 1 } }, "BASIC", "annual", 4000) || "", /does not match/);
});

test("calendar-month reset expires unused credits without rolling them forward", () => {
  assert.equal(creditResetMonthKey(new Date("2026-10-31T23:59:59.999Z")), "2026-10");
  assert.equal(creditResetMonthKey(new Date("2026-11-01T00:00:00.000Z")), "2026-11");
  assert.equal(resetCreditUsage(37), 0);
  assert.equal(resetCreditUsage(0), 0);
});
