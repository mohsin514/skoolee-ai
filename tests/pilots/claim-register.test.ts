import { test } from "node:test";
import assert from "node:assert/strict";
// SKAI-834: every claim in the register carries an owner and an expiry; expired or ownerless claims never approve or export.
const created: Record<string, unknown>[] = [];
let claimRow: Record<string, unknown> = {};
const pilots: Record<string, Record<string, unknown>> = {
  "QA-01-A": { id: "QA-01-A", synthetic: false, targetSchoolId: "QA-01-school-a", caseStudyPermission: "ANONYMISED", permissionReference: "QA-01 permission", charterHistory: [], workflows: [] },
  "QA-01-B": { id: "QA-01-B", synthetic: false, targetSchoolId: "QA-01-school-b", caseStudyPermission: "NONE", permissionReference: null, charterHistory: [], workflows: [] },
};
globalThis.prisma = {
  pilot: { findUnique: async ({ where }: { where: { id: string } }) => pilots[where.id] ?? null },
  pilotClaim: {
    create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return data; },
    findFirst: async ({ where }: { where: { id: string; pilotId: string } }) => (claimRow.pilotId === where.pilotId ? claimRow : null),
  },
} as never;

const base = { statement: "QA-01 marks entry took less time after the pilot", findingKey: "TIME:MARKS_ENTRY" };

test("proposing a claim requires an owner and a future expiry", async () => {
  const { proposeClaim } = await import("../../src/lib/pilots/service");
  await assert.rejects(proposeClaim("QA-01-A", base, "QA-01-owner"), (e: Error & { status?: number }) => e.status === 400);
  await assert.rejects(proposeClaim("QA-01-A", { ...base, ownerName: "QA-01 lead", expiresOn: "2020-01-01" }, "QA-01-owner"), /past/);
  await proposeClaim("QA-01-A", { ...base, ownerName: "QA-01 lead", expiresOn: "2099-01-01" }, "QA-01-owner");
  assert.equal(created.at(-1)!.ownerName, "QA-01 lead");
  assert.equal((created.at(-1)!.expiresOn as Date).toISOString().slice(0, 10), "2099-01-01");
  await assert.rejects(proposeClaim("QA-01-missing", { ...base, ownerName: "QA-01 lead", expiresOn: "2099-01-01" }, "QA-01-owner"), /not found/);
});

test("register gate blocks ownerless, expired and cross-pilot claims at approval", async () => {
  const { reviewClaim, claimRegisterBlock } = await import("../../src/lib/pilots/service");
  const approve = { decision: "APPROVE", note: "QA-01 reviewed source", version: 1 };
  claimRow = { id: "c1", pilotId: "QA-01-A", version: 1, findingKey: "TIME:MARKS_ENTRY", ownerName: null, expiresOn: null, history: [] };
  await assert.rejects(reviewClaim("QA-01-A", "c1", approve, "QA-01-owner"), /owner and expiry/);
  claimRow = { ...claimRow, ownerName: "QA-01 lead", expiresOn: new Date("2020-01-01") };
  await assert.rejects(reviewClaim("QA-01-A", "c1", approve, "QA-01-owner"), /expired/);
  // A claim on pilot A is not reachable through pilot B.
  await assert.rejects(reviewClaim("QA-01-B", "c1", approve, "QA-01-owner"), /not found/);
  assert.equal(claimRegisterBlock({ ownerName: "QA-01 lead", expiresOn: new Date("2026-11-13") }, new Date("2026-11-13T23:00:00Z")), null);
  assert.match(claimRegisterBlock({ ownerName: "QA-01 lead", expiresOn: new Date("2026-11-12") }, new Date("2026-11-13T00:00:00Z"))!, /expired/);
});
