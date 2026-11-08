import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAllMarkets, evaluateMarketTrust, TRUST_REQUIREMENTS, type TrustEvidence } from "../../src/lib/school-ai/market-trust-readiness";

const now = new Date("2026-11-01");
const full = (locales: string[]): TrustEvidence[] => TRUST_REQUIREMENTS.map((requirement) => ({
  requirement, reference: `restricted/${requirement}`, reviewedAt: new Date("2026-10-30"), reviewDueAt: new Date("2027-10-30"), locales,
}));

test("blocks every market with no evidence", () => {
  for (const r of evaluateAllMarkets({}, now)) assert.equal(r.ready, false);
});
test("KSA requires Arabic and English notices", () => {
  const r = evaluateMarketTrust("KSA", full(["en", "ur"]), now);
  assert.ok(!r.ready && r.missing.includes("NOTICES"));
  assert.deepEqual(evaluateMarketTrust("KSA", full(["ar", "en"]), now), { market: "KSA", ready: true });
});
test("an unresolved transfer blocks only that market", () => {
  const ksa = full(["ar", "en"]).filter((e) => e.requirement !== "TRANSFER_BASIS");
  const [pk, sa, ae] = evaluateAllMarkets({ PAKISTAN: full(["en", "ur"]), KSA: ksa, UAE_DUBAI: full(["ar", "en"]) }, now);
  assert.equal(pk.ready, true);
  assert.equal(ae.ready, true);
  assert.ok(!sa.ready && sa.missing.join() === "TRANSFER_BASIS");
});
test("expired or future-dated reviews do not count", () => {
  const expired = full(["ar", "en"]).map((e) => ({ ...e, reviewDueAt: new Date("2026-10-31") }));
  assert.equal(evaluateMarketTrust("UAE_DUBAI", expired, now).ready, false);
  const future = full(["ar", "en"]).map((e) => ({ ...e, reviewedAt: new Date("2027-01-01") }));
  assert.equal(evaluateMarketTrust("UAE_DUBAI", future, now).ready, false);
});
