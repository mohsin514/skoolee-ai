import assert from "node:assert/strict";
import test from "node:test";
import { COMMERCIAL_CONTRACT, createPlanContract, decodePlanContractMetadata, encodePlanContractMetadata, getSchoolPlanContract, validateCommercialContract } from "@/config/commercial-contract";
import { PLANS, PLAN_ORDER, annualMonthlyPrice } from "@/config/plans";
import { currencyForCountry, defaultPricingCurrency } from "@/lib/locale/country";
import { stripePriceMismatch } from "@/lib/stripe/server";
import { creditResetMonthKey, resetCreditUsage } from "@/lib/billing/credit-policy";
import { planPeriodAmount } from "@/lib/billing/plan-pricing";

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

/** Terms a paid school saved under catalogue 2026-10-08.1 (flat monthly price, no `pricing`). */
const LEGACY_BASIC = {
  catalogVersion: "2026-10-08.1", effectiveAt: "2026-09-01T00:00:00.000Z", plan: "BASIC", name: "Pro", price: 4000,
  priceCurrency: "PKR", priceLabel: "PKR 4,000/mo", features: ["Up to 500 students", "1,000 AI credits/month"],
  aiCredits: 1000, maxStudents: 500, maxTeachers: 10, maxCampuses: 1,
  whatsappEnabled: true, pdfExportEnabled: true, pdfBulkExport: true, analyticsEnabled: false,
  aiCreditPolicy: { allowance: "plan-monthly", unused: "expire-at-calendar-month-reset", reset: "zero-used-on-calendar-month-boundary" },
};

test("a paid school keeps its approved pre-2026-11-12 terms: flat price, limits, credits and every newly gated feature", () => {
  const terms = getSchoolPlanContract("BASIC", LEGACY_BASIC);
  assert.equal(terms.contractVersion, "2026-10-08.1");
  assert.equal(terms.pricing, "per_school");
  assert.equal(terms.price, 4000);
  assert.equal(terms.minBilledStudents, 0);
  assert.equal(terms.maxStudents, 500);
  assert.equal(terms.maxTeachers, 10);
  assert.equal(terms.aiCredits, 1000);
  assert.equal(terms.aiCreditsPerStudent, 0);
  assert.equal(terms.analyticsEnabled, false, "a recorded term is kept as recorded");
  for (const flag of ["timetableEnabled", "examPlanningEnabled", "aiWorkflowsEnabled", "examStudioEnabled", "markSheetScanEnabled", "aiRemarksEnabled", "groupConsoleEnabled", "apiAccessEnabled"] as const) {
    assert.equal(terms[flag], true, `${flag}: nothing was gated when these terms were approved`);
  }
  assert.equal(planPeriodAmount(terms, 900, "monthly"), 4000, "a flat price does not scale with students");
  assert.equal(planPeriodAmount(terms, 900, "annual"), 38400);
});

test("an old free snapshot reads as today's Core: no caps, PDF export, no flagship", () => {
  const terms = getSchoolPlanContract("FREE", { ...LEGACY_BASIC, plan: "FREE", name: "Basic", price: 0, aiCredits: 100, maxStudents: 50, maxTeachers: 2, pdfExportEnabled: false, whatsappEnabled: false, pdfBulkExport: false });
  assert.equal(terms.name, "Core");
  assert.equal(terms.maxStudents, -1);
  assert.equal(terms.maxTeachers, -1);
  assert.equal(terms.maxCampuses, -1);
  assert.equal(terms.pdfExportEnabled, true);
  assert.equal(terms.aiCredits, 0);
  assert.equal(terms.timetableEnabled, false);
  assert.equal(terms.aiWorkflowsEnabled, false);
});

test("terms saved from this catalogue keep their own flags and per-student pricing", () => {
  const terms = getSchoolPlanContract("BASIC", createPlanContract("BASIC", { billedStudents: 250 }));
  assert.equal(terms.pricing, "per_student");
  assert.equal(terms.billedStudents, 250);
  assert.equal(terms.timetableEnabled, true);
  assert.equal(terms.examPlanningEnabled, true);
  assert.equal(terms.aiWorkflowsEnabled, false);
  assert.equal(terms.examStudioEnabled, false);
  const broken = { ...createPlanContract("PRO"), aiWorkflowsEnabled: "yes" };
  assert.equal(getSchoolPlanContract("PRO", broken).contractVersion, COMMERCIAL_CONTRACT.version, "a malformed new snapshot falls back to the catalogue");
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
  const perStudent = createPlanContract("PRO", { billedStudents: 340, effectiveAt: new Date("2026-11-12T00:00:00.000Z") });
  assert.deepEqual(decodePlanContractMetadata(encodePlanContractMetadata(perStudent), "PRO"), perStudent);
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

// SKAI-883: every surface describes one rule — usage resets each UTC calendar month and unused credits expire.
test("credit expiry wording is the same on every surface", async () => {
  const { readFileSync } = await import("node:fs");
  const { creditResetMonthKey, resetCreditUsage } = await import("../../src/lib/billing/credit-policy");
  const read = (file: string) => readFileSync(file, "utf8");
  assert.equal(resetCreditUsage(480), 0);
  assert.equal(creditResetMonthKey(new Date("2026-12-31T23:59:59Z")), "2026-12");
  assert.equal(creditResetMonthKey(new Date("2027-01-01T00:00:00Z")), "2027-01");
  assert.doesNotMatch(read("src/config/plans.ts"), /at renewal/);
  assert.doesNotMatch(read("src/app/api/cron/ai-credits-reset/route.ts"), /rollover/i);
  assert.match(read("src/app/owner/page.tsx"), /Unused credits expire when usage resets at the start of each calendar month/);
  assert.match(read("src/components/marketing/PricingPage.tsx"), /Unused AI credits expire at the calendar month reset\. Credits do not roll over\./);
});
