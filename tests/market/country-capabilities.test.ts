import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITY_AREAS, COUNTRY_CAPABILITIES, capabilityState, missingCapabilities, type CapabilityArea, type CapabilityEntry } from "../../src/config/country-capabilities";
import { COUNTRIES } from "../../src/lib/locale/country";

const now = new Date("2026-11-08T00:00:00Z");
const evidenced: CapabilityEntry = { claim: "supported", owner: "Academic lead", evidence: "SKAI-000", evidenceDate: "2026-11-01", evidenceExpires: "2027-05-01" };

test("every country row covers every area and claims nothing without evidence", () => {
  for (const country of COUNTRIES) for (const area of CAPABILITY_AREAS) {
    const entry = COUNTRY_CAPABILITIES[country][area];
    assert.ok(entry, `${country}.${area}`);
    if (entry.claim === "pilot" || entry.claim === "supported") assert.equal(capabilityState(entry, now), entry.claim, `${country}.${area} needs current evidence`);
  }
});

test("expired, future or ownerless evidence removes the ready claim", () => {
  assert.equal(capabilityState(evidenced, now), "supported");
  assert.equal(capabilityState({ ...evidenced, evidenceExpires: "2026-11-07" }, now), "configured");
  assert.equal(capabilityState({ ...evidenced, evidenceDate: "2026-12-01" }, now), "configured");
  assert.equal(capabilityState({ ...evidenced, owner: undefined }, now), "configured");
  assert.equal(capabilityState({ claim: "unavailable" }, now), "unavailable");
});

test("academic-only Saudi pilot is not blocked by payroll or tax, but a finance pilot names the gaps", () => {
  const matrix = { ...COUNTRY_CAPABILITIES, SA: { ...COUNTRY_CAPABILITIES.SA, academic: evidenced } };
  assert.deepEqual(missingCapabilities("SA", ["academic"], { now, matrix }), []);
  const gaps = missingCapabilities("SA", ["academic", "tax", "payments"] as CapabilityArea[], { now, matrix });
  assert.deepEqual(gaps.map((g) => [g.area, g.state]), [["tax", "unavailable"], ["payments", "unavailable"]]);
  assert.ok(gaps.every((g) => g.alternative));
});
