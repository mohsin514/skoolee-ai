import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { currentWindowWhere, planCovers, planPhase, type PlanRow } from "@/lib/accommodations/plan";

const plan = (from: string, until: string, status = "ACTIVE"): PlanRow => ({ id: "p", version: 1, status, validFrom: new Date(`${from}T00:00:00.000Z`), validUntil: new Date(`${until}T00:00:00.000Z`), assessmentTypes: ["EXAM"], extraMinutes: 10, extraPercent: 0, breakMinutes: 0, capabilities: {}, instructions: "" });
const at = (d: string) => new Date(`${d}T09:00:00.000Z`);

test("SKAI-1487: phase matches exam enforcement at both window boundaries", () => {
  const p = plan("2026-11-02", "2026-11-10");
  for (const [d, phase] of [["2026-11-01", "UPCOMING"], ["2026-11-02", "CURRENT"], ["2026-11-10", "CURRENT"], ["2026-11-11", "EXPIRED"]] as const) {
    assert.equal(planPhase(p, at(d)), phase, d);
    assert.equal(planCovers(p, "EXAM", at(d)), phase === "CURRENT", `enforcement agrees on ${d}`);
  }
  assert.equal(planPhase(plan("2026-01-01", "2026-12-31", "REVOKED"), at("2026-06-01")), "REVOKED");
});

test("SKAI-1487: the current-window filter is the same UTC day window", () => {
  assert.deepEqual(currentWindowWhere(at("2026-11-02")), { status: "ACTIVE", validFrom: { lt: new Date("2026-11-03T00:00:00.000Z") }, validUntil: { gte: new Date("2026-11-02T00:00:00.000Z") } });
});

test("SKAI-1487: teacher, guardian and learner views list only in-window plans; coordinator rows carry the phase", () => {
  const service = readFileSync("src/lib/accommodations/service.ts", "utf8");
  assert.equal((service.match(/\.\.\.currentWindowWhere\(new Date\(\)\)/g) ?? []).length, 2);
  assert.match(service, /phase: planPhase\(plan, now\)/);
  const ui = readFileSync("src/components/accommodations/AccessPlans.tsx", "utf8");
  assert.match(ui, /\(plan\.phase \?\? "CURRENT"\) === "CURRENT"/);
});
