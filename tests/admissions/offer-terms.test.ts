import { before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1258: offer terms and acceptance deposit validation, and the family's recorded agreement.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
mock.module(src("lib/api/scope.ts"), { namedExports: { ApiError } });
let mod: typeof import("../../src/lib/admissions/offer-terms");
before(async () => { mod = await import("../../src/lib/admissions/offer-terms"); });

test("an offer without terms or deposit stores nothing", () => {
  assert.deepEqual(mod.parseOfferTerms({}), { offerTerms: null, depositAmount: null, depositCurrency: null });
});

test("a deposit needs a whole positive amount and a currency code", () => {
  assert.deepEqual(mod.parseOfferTerms({ depositAmount: "5000", depositCurrency: "sar", offerTerms: "Synthetic QA-01 enrolment terms." }), { offerTerms: "Synthetic QA-01 enrolment terms.", depositAmount: 5000, depositCurrency: "SAR" });
  for (const bad of [{ depositAmount: "0", depositCurrency: "SAR" }, { depositAmount: "12.5", depositCurrency: "SAR" }, { depositAmount: "-3", depositCurrency: "SAR" }, { depositAmount: "100" }, { depositAmount: "100", depositCurrency: "RIYAL" }, { offerTerms: "short" }])
    assert.throws(() => mod.parseOfferTerms(bad), { status: 400 });
});

test("accepting an offer with terms requires explicit agreement and records the hash of that text", () => {
  const now = new Date("2026-11-13T10:00:00Z");
  assert.throws(() => mod.acceptTerms({ offerTerms: "Synthetic QA-01 enrolment terms." }, false, now), { status: 400 });
  assert.throws(() => mod.acceptTerms({ offerTerms: "Synthetic QA-01 enrolment terms." }, "yes", now), { status: 400 });
  const agreed = mod.acceptTerms({ offerTerms: "Synthetic QA-01 enrolment terms." }, true, now);
  assert.equal(agreed.termsAcceptedAt, now);
  assert.equal(agreed.termsHash, mod.termsHash("Synthetic QA-01 enrolment terms."));
  assert.notEqual(agreed.termsHash, mod.termsHash("Synthetic QA-01 enrolment terms, edited."));
  assert.deepEqual(mod.acceptTerms({ offerTerms: null }, false, now), { termsAcceptedAt: null, termsHash: null });
});
