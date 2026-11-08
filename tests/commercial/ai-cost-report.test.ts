import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeCostReport, COST_REPORT_CSV_HEADER, type PlanInfo } from "../../src/lib/owner/ai-cost-math";

// SKAI-1042 (D1-02): OpenAI spend ÷ credits consumed per school and month, with margin vs plan price.
const plans = new Map<string, PlanInfo>([
  ["s1", { name: "Alpha", plan: "BASIC", planPricePkr: 4000, planCredits: 1000 }],
  ["s2", { name: "Beta", plan: "FREE", planPricePkr: 0, planCredits: 100 }],
]);
const rates = { usdPerMillionTokens: { "gpt-a": 2, "gpt-b": 10 }, pkrPerUsd: 280 };

test("spend, cost per credit and margin are computed per school and month across models", () => {
  const rows = computeCostReport([
    { schoolId: "s1", month: "2026-10", model: "gpt-a", tokens: 1_000_000, credits: 300, calls: 30 },
    { schoolId: "s1", month: "2026-10", model: "gpt-b", tokens: 500_000, credits: 100, calls: 10 },
    { schoolId: "s1", month: "2026-09", model: "gpt-a", tokens: 250_000, credits: 50, calls: 5 },
  ], plans, rates);
  assert.equal(rows.length, 2);
  const oct = rows[0];
  assert.equal(oct.month, "2026-10");
  assert.equal(oct.credits, 400);
  assert.equal(oct.spendUsd, 7); // 1M×2 + 0.5M×10
  assert.equal(oct.spendPkr, 1960);
  assert.equal(oct.costPerCreditPkr, 4.9);
  assert.equal(oct.pricePerCreditPkr, 4);
  assert.equal(oct.marginPkr, 2040);
  assert.equal(oct.marginPct, 51);
});

test("an unpriced model makes spend unknown rather than zero", () => {
  const [row] = computeCostReport([{ schoolId: "s1", month: "2026-10", model: "unknown-model", tokens: 10, credits: 1, calls: 1 }], plans, rates);
  assert.equal(row.unpricedTokens, 10);
  assert.equal(row.spendUsd, null);
  assert.equal(row.marginPkr, null);
});

test("no FX rate leaves PKR figures unknown; free plan margin is negative spend with no percentage", () => {
  assert.equal(computeCostReport([{ schoolId: "s1", month: "2026-10", model: "gpt-a", tokens: 1_000_000, credits: 1, calls: 1 }], plans, { ...rates, pkrPerUsd: null })[0].spendPkr, null);
  const [free] = computeCostReport([{ schoolId: "s2", month: "2026-10", model: "gpt-a", tokens: 1_000_000, credits: 10, calls: 1 }], plans, rates);
  assert.equal(free.marginPkr, -560);
  assert.equal(free.marginPct, null);
});

test("the route is platform-owner only, unscoped reads state a reason, and CSV uses the shared encoder", () => {
  const route = readFileSync("src/app/api/owner/ai-cost-report/route.ts", "utf8");
  assert.equal((route.match(/requirePlatformOwner\(\)/g) ?? []).length, 2);
  assert.match(route, /assertSameOrigin\(request\)/);
  const lib = readFileSync("src/lib/owner/ai-cost-report.ts", "utf8");
  for (const call of lib.matchAll(/runUnscoped\(([^,]+),/g)) assert.match(call[1], /^"ai cost report: .{10,}"$/);
  assert.match(lib, /from "@\/lib\/csv"/);
  assert.match(lib, /\.map\(csvCell\)/);
  assert.equal(COST_REPORT_CSV_HEADER.length, 16);
});
