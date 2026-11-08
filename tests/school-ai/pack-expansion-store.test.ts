import assert from "node:assert/strict";
import test from "node:test";
import { SCIENCE_CALIBRATION } from "../../src/lib/school-ai/pack-expansion-gate";
import { availableExpansionPackIds, isExpansionCandidate, listExpansionStatus, recordExpansionDecision } from "../../src/lib/school-ai/pack-expansion-store";

// SKAI-1019/1020: synthetic in-memory store; proves persistence/audit/fail-closed behaviour, not that any pack is verified.
type Row = { id: string; candidateId: string; outcome: string; record: unknown; boundedTicket: string | null; decidedById: string; createdAt: Date };
function fakeDb() {
  const rows: Row[] = []; const audits: unknown[] = []; let clock = 0;
  const packExpansionDecision = {
    create: async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => { const row = { ...data, id: `d${rows.length}`, createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, clock++)) }; rows.push(row); return row; },
    findMany: async () => [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  };
  const superAdminAuditLog = { create: async ({ data }: { data: unknown }) => { audits.push(data); return data; } };
  const db = { packExpansionDecision, superAdminAuditLog, $transaction: async (fn: (tx: unknown) => unknown) => fn({ packExpansionDecision, superAdminAuditLog }) };
  return { rows, audits, db: db as never };
}
const owner = { userId: "owner-1", role: "APP_OWNER" };
const signoff = { role: "Physics educator E-01", reference: "REVIEW-LINK", on: "2026-11-01" };
const physics = (outcome = "ADOPT") => ({
  candidateId: "AE-CAIE-0625-PHYSICS",
  source: { board: "Cambridge International", qualification: "IGCSE 0625", subject: "Physics", grade: "Year 10", edition: "synthetic", examYear: "2027", academicYear: "2026-27", term: "Full year", tier: "Extended", language: "en", officialUrl: "https://example.test/0625", retrievedOn: "2026-10-29", rightsStatus: "SCHOOL_APPROVED", verification: "VERIFIED" },
  schoolSelection: { academicOwner: "Head of Science H-01", reference: "SELECTION-LINK", on: "2026-11-01" },
  calibration: SCIENCE_CALIBRATION.map((area) => ({ area, signoff })),
  educatorSignoff: signoff, disabledQuestionTypes: ["PRACTICAL_PAPER"],
  decision: { outcome, founder: { ...signoff, role: "Founder" }, educator: signoff, rationale: "Synthetic fixture for the persistence test only.", boundedTicket: outcome === "ADOPT" ? "SKAI-9999" : undefined },
  pilotReadinessPassed: true,
});

test("every candidate is pending and unavailable with no stored decisions", async () => {
  const { db } = fakeDb();
  const list = await listExpansionStatus(new Set(), db);
  assert.equal(list.length, 12);
  assert.ok(list.every((r) => r.outcome === "PENDING" && !r.available && r.blockers.length > 0));
  assert.equal((await availableExpansionPackIds(new Set(), db)).size, 0);
});

test("only the platform owner may record, with a real decision and bounded ticket for ADOPT", async () => {
  const { db, rows } = fakeDb();
  await assert.rejects(recordExpansionDecision({ userId: "p", role: "PRINCIPAL" }, physics(), {}, db), /Forbidden/);
  await assert.rejects(recordExpansionDecision(owner, { ...physics(), decision: undefined }, {}, db), /ADOPT, DEFER or REJECT/);
  await assert.rejects(recordExpansionDecision(owner, { ...physics(), decision: { ...physics().decision, boundedTicket: undefined } }, {}, db), /bounded/);
  await assert.rejects(recordExpansionDecision(owner, { ...physics(), candidateId: "XX-NEW" }, {}, db), /SKAI-1006/);
  assert.equal(rows.length, 0);
});

test("decisions are append-only, audited, and availability still needs the maths gate", async () => {
  const { db, rows, audits } = fakeDb();
  await recordExpansionDecision(owner, physics("DEFER"), {}, db);
  await recordExpansionDecision(owner, physics("ADOPT"), {}, db);
  assert.equal(rows.length, 2);
  assert.equal(audits.length, 2);
  assert.deepEqual((audits[1] as { newValues: { calibrationAreas: string[] } }).newValues.calibrationAreas, [...SCIENCE_CALIBRATION]);
  const blocked = (await listExpansionStatus(new Set(), db)).find((r) => r.id === "AE-CAIE-0625-PHYSICS")!;
  assert.equal(blocked.outcome, "ADOPT");
  assert.equal(blocked.available, false);
  assert.ok(blocked.blockers.some((b) => /0580/.test(b)));
  assert.deepEqual([...await availableExpansionPackIds(new Set(["AE-CAIE-0580-MATH"]), db)], ["AE-CAIE-0625-PHYSICS"]);
  await recordExpansionDecision(owner, physics("REJECT"), {}, db);
  assert.equal((await availableExpansionPackIds(new Set(["AE-CAIE-0580-MATH"]), db)).size, 0);
});

test("registry hook fails closed when the store cannot be read", async () => {
  const broken = { packExpansionDecision: { findMany: async () => { throw new Error("down"); } } } as never;
  assert.equal((await availableExpansionPackIds(new Set(), broken)).size, 0);
  assert.ok(isExpansionCandidate("PK-BSEK-SSC-MATH"));
  assert.ok(!isExpansionCandidate("PK-FBISE-G9-MATH"));
});
