import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readyRecord, trustRows } from "./readiness-fixture";

// In-memory persistence that honours `where.schoolId` and the other filters the service uses; validation and gates are real.
type Row = Record<string, unknown>;
const store: Record<string, Row[]> = { pilotProposal: [], pilotCommercialEvent: [], pilotReadinessRecord: [], marketTrustReview: [] };
const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([k, v]) => row[k] === v);
const sortDesc = (rows: Row[], key: string) => [...rows].sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0));
const delegate = (name: string) => ({
  findFirst: async ({ where }: { where?: Row }) => sortDesc(store[name].filter((r) => matches(r, where)), "version")[0] ?? null,
  findMany: async ({ where }: { where?: Row } = {}) => sortDesc(store[name].filter((r) => matches(r, where)), "version"),
  create: async ({ data }: { data: Row }) => { const row = { id: `${name}-${store[name].length + 1}`, createdAt: new Date(), supersededAt: null, ...data }; store[name].push(row); return row; },
  updateMany: async ({ where, data }: { where: Row; data: Row }) => { const hit = store[name].filter((r) => matches(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
});
const fake: Record<string, unknown> = Object.fromEntries(Object.keys(store).map((n) => [n, delegate(n)]));
fake.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(fake);
globalThis.prisma = fake as never;
const reset = () => Object.values(store).forEach((rows) => rows.splice(0));

const proposal = (over: Record<string, unknown> = {}) => ({ market: "PAKISTAN", city: "Lahore", pack: "BISE Lahore Math 9", academicYear: "2026-27", campuses: 2, users: 12, startsOn: "2026-11-01", endsOn: "2027-01-31", amount: null, currency: "PKR", budgetApprover: "Bursar B-01", academicChampion: "Lead L-01", dataProcessingApprover: "Principal P-01", baselineCriteria: "Marking time per paper", exitExport: "CSV export at exit", claims: [], ...over });

test("proposals are versioned per school and record validateProposal problems; UNDECIDED price is allowed", async () => {
  reset();
  const svc = await import("../../src/lib/pilots/readiness-service");
  const a1 = await svc.saveProposal("school-a", proposal(), "owner");
  assert.equal(a1.version, 1); assert.deepEqual(a1.problems, []); assert.equal(a1.amount, null);
  const a2 = await svc.saveProposal("school-a", proposal({ currency: "SAR", claims: ["Guaranteed time savings"] }), "owner");
  assert.equal(a2.version, 2);
  assert.ok(a2.problems.some((p) => /Currency must be PKR/.test(p)));
  assert.ok(a2.problems.some((p) => /guaranteed/.test(p)));
  const b1 = await svc.saveProposal("school-b", proposal(), "owner");
  assert.equal(b1.version, 1, "school B numbering is independent of school A");
  const recordsB = await svc.schoolPilotRecords("school-b");
  assert.equal(recordsB.proposals.length, 1);
  assert.ok(recordsB.proposals.every((p) => p.schoolId === "school-b"), "school B never sees school A rows");
});

test("commercial stage is derived from references, never asserted", async () => {
  reset();
  const svc = await import("../../src/lib/pilots/readiness-service");
  assert.equal((await svc.recordCommercialEvent("school-a", { demoAttended: true }, "owner")).stage, "DEMO_INTEREST");
  assert.equal((await svc.recordCommercialEvent("school-a", { signedAgreementRef: "AGR-0001" }, "owner")).stage, "CONSENTED_PILOT");
  assert.equal((await svc.recordCommercialEvent("school-a", { signedAgreementRef: "AGR-0001", settlementRef: "SET-0001" }, "owner")).stage, "PAID_COMMITMENT");
  await assert.rejects(svc.recordCommercialEvent("school-a", { settlementRef: "SET-0001" }, "owner"), /signed agreement/);
});

test("trust reviews supersede the previous one and reject future or inverted dates", async () => {
  reset();
  const svc = await import("../../src/lib/pilots/readiness-service");
  const base = { market: "PAKISTAN", requirement: "LEGAL_REVIEW", reference: "QA-LEGAL-1", reviewer: "Counsel C-01", reviewedAt: "2026-01-05" };
  await svc.recordTrustReview(base, "owner");
  await svc.recordTrustReview({ ...base, reference: "QA-LEGAL-2" }, "owner");
  assert.equal(store.marketTrustReview.filter((r) => r.supersededAt === null).length, 1);
  await assert.rejects(svc.recordTrustReview({ ...base, reviewedAt: "2099-01-01" }, "owner"), /future/);
  await assert.rejects(svc.recordTrustReview({ ...base, reviewDueAt: "2025-01-01" }, "owner"), /expiry/);
  await assert.rejects(svc.recordTrustReview({ ...base, reviewer: "c@example.com" }, "owner"), /pseudonym/);
  const board = await svc.marketTrustBoard();
  const pk = board.markets.find((m) => m.market === "PAKISTAN")!;
  assert.equal(pk.ready, false);
  assert.ok(!pk.ready && !pk.missing.includes("LEGAL_REVIEW") && pk.missing.includes("NOTICES"));
});

test("activation gate: fail-closed until readiness AND market trust pass, per school", async () => {
  reset();
  const svc = await import("../../src/lib/pilots/readiness-service");
  assert.deepEqual(await svc.pilotActivationGate(null), { allowed: false, blockers: [{ item: "SCHOOL", reason: "Link the pilot to a school before it can become active." }] });
  let gate = await svc.pilotActivationGate("school-a");
  assert.ok(!gate.allowed && gate.blockers[0].item === "READINESS");

  const saved = await svc.saveReadinessRecord("school-a", readyRecord(), "owner");
  assert.equal(saved.ready, true); assert.equal(saved.market, "PAKISTAN");
  gate = await svc.pilotActivationGate("school-a");
  assert.ok(!gate.allowed && gate.blockers.every((b) => b.item === "MARKET_TRUST"), "readiness alone is not enough");

  store.marketTrustReview.push(...trustRows("PAKISTAN"));
  assert.deepEqual(await svc.pilotActivationGate("school-a"), { allowed: true, market: "PAKISTAN" });
  const b = await svc.pilotActivationGate("school-b");
  assert.ok(!b.allowed && b.blockers[0].item === "READINESS", "school A's record never opens school B");

  const narrow = readyRecord(); narrow.decision.outcome = "NARROW";
  await svc.saveReadinessRecord("school-a", narrow, "owner");
  gate = await svc.pilotActivationGate("school-a");
  assert.ok(!gate.allowed && gate.blockers.some((x) => x.item === "DECISION"), "the latest version governs");
});

test("KSA readiness needs a Pakistan GO first and its own trust gate", async () => {
  reset();
  const svc = await import("../../src/lib/pilots/readiness-service");
  const ksa = await svc.saveReadinessRecord("school-k", readyRecord("KSA_RIYADH"), "owner");
  assert.equal(ksa.ready, false);
  assert.ok((ksa.blockers as { item: string }[]).some((x) => x.item === "SEQUENCE"));
  await svc.saveReadinessRecord("school-a", readyRecord(), "owner");
  store.marketTrustReview.push(...trustRows("PAKISTAN"));
  const gate = await svc.pilotActivationGate("school-k");
  assert.ok(!gate.allowed && gate.blockers.every((x) => x.item === "MARKET_TRUST"), "Pakistan trust evidence never satisfies KSA");
});

test("every pilot-readiness route handler requires a platform owner", () => {
  const src = readFileSync(new URL("../../src/app/api/owner/pilot-readiness/route.ts", import.meta.url), "utf8");
  const handlers = src.split(/export async function /).slice(1);
  assert.equal(handlers.length, 2);
  for (const h of handlers) assert.match(h, /await requirePlatformOwner\(\)/);
});
