import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1403: a digest with a blocked entry must reopen for review, not be marked sent.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
const digestUpdates: Record<string, unknown>[] = [];
const digest = { id: "d1", status: "APPROVED", weekStart: new Date("2026-10-26T00:00:00Z"), version: 1, approvedVersion: 1, entries: [] as unknown[] };

const tx = {
  $queryRaw: async () => [{ id: "d1" }],
  familyDigest: {
    findUnique: async () => digest,
    update: async ({ data }: { data: Record<string, unknown> }) => { digestUpdates.push(data); return data; },
  },
  familyDigestEntry: { update: async () => ({}) },
  assignmentFeedback: { findFirst: async () => null },
  guardianRelationship: { findMany: async () => [{ guardianUserId: "g1" }] },
  familyDigestDelivery: { findUnique: async () => null, create: async () => ({ id: "del1" }) },
};

// SKAI-474: dispatch must run through tenantTransaction (the RLS-aware wrapper), not a raw prisma.$transaction.
const tenantTransactionCalls: string[] = [];
mock.module(src("lib/db/prisma.ts"), { namedExports: {
  prisma: { $transaction: async () => { throw new Error("dispatchDigest must not use prisma.$transaction"); } },
  tenantTransaction: async (fn: (t: unknown) => unknown) => { tenantTransactionCalls.push("tenant"); return fn(tx); },
} });

test("a digest with a blocked entry reopens for review and is not marked sent", async () => {
  const { dispatchDigest } = await import(src("lib/family/digests.ts"));
  digestUpdates.length = 0;
  digest.entries = [{ id: "e1", studentId: "s1", skipped: false, content: { statements: [{ id: "st1", sourceType: "feedback", sourceId: "f1" }] } }];
  const result = await dispatchDigest("school1", "d1", new Date("2026-10-31T00:00:00Z"));
  assert.equal(result.blocked, 1);
  assert.equal(digestUpdates.at(-1)?.status, "DRAFT");
  assert.equal(digestUpdates.at(-1)?.approvedVersion, null);
  assert.equal(digestUpdates.some(d => d.status === "SENT"), false);
});

test("dispatch runs inside the tenant transaction wrapper", async () => {
  const { dispatchDigest } = await import(src("lib/family/digests.ts"));
  digestUpdates.length = 0;
  tenantTransactionCalls.length = 0;
  digest.entries = [];
  await dispatchDigest("school1", "d1", new Date("2026-10-31T00:00:00Z"));
  assert.deepEqual(tenantTransactionCalls, ["tenant"]);
});

test("a fully sent digest is still marked sent", async () => {
  const { dispatchDigest } = await import(src("lib/family/digests.ts"));
  digestUpdates.length = 0;
  digest.entries = [{ id: "e2", studentId: "s2", skipped: false, content: { statements: [] } }];
  const result = await dispatchDigest("school1", "d1", new Date("2026-10-31T00:00:00Z"));
  assert.equal(result.blocked, 0);
  assert.equal(digestUpdates.at(-1)?.status, "SENT");
});
