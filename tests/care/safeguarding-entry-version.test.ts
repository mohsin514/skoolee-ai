import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-593: lead entries (note, owner, escalation, close) change a case only under the version the lead saw.
type Concern = { id: string; schoolId: string; campusId: string; studentId: string; status: string; ownerId: string | null; version: number };
const concerns: Concern[] = [], entries: Array<{ kind: string }> = [], updates: unknown[] = [];
const members: Record<string, { schoolId: string; campusId: string; role: string }> = {
  "lead-a": { schoolId: "school-a", campusId: "campus-a1", role: "LEAD" },
  "lead-a2": { schoolId: "school-a", campusId: "campus-a2", role: "LEAD" },
  "lead-b": { schoolId: "school-b", campusId: "campus-b1", role: "LEAD" },
};
const client = {
  confidentialMember: { findFirst: async ({ where }: { where: { userId: string; schoolId: string } }) => { const m = members[where.userId]; return m && m.schoolId === where.schoolId ? { ...m, userId: where.userId, domain: "SAFEGUARDING" } : null; } },
  confidentialSetting: { findFirst: async () => ({ enabled: true }) },
  confidentialAccessLog: { create: async ({ data }: { data: unknown }) => data },
  safeguardingConcern: {
    findFirst: async ({ where }: { where: { id: string; schoolId: string; campusId: string } }) => concerns.find((c) => c.id === where.id && c.schoolId === where.schoolId && c.campusId === where.campusId) ?? null,
    updateMany: async ({ where, data }: { where: { id: string; version: unknown }; data: Record<string, unknown> }) => {
      if (typeof where.version !== "number" || !Number.isInteger(where.version)) throw new Error("PrismaClientValidationError: Argument `version` must be an Int");
      updates.push(data);
      const c = concerns.find((x) => x.id === where.id && x.version === where.version);
      if (!c) return { count: 0 };
      c.version += 1;
      return { count: 1 };
    },
  },
  safeguardingEntry: { create: async ({ data }: { data: { kind: string } }) => { entries.push(data); return data; } },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: client } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async <T>(_u: unknown, work: (tx: unknown) => Promise<T>) => work(client) } });

const as = (id: string) => ({ userId: id, schoolId: members[id].schoolId, campusId: members[id].campusId, role: "TEACHER" }) as never;
const reset = () => { concerns.length = 0; entries.length = 0; updates.length = 0; concerns.push({ id: "sg-qa-1", schoolId: "school-a", campusId: "campus-a1", studentId: "kid-a", status: "TRIAGED", ownerId: "lead-a", version: 3 }); };
const svc = async () => await import("../../src/lib/care/service");
const status = (code: number) => (e: { status?: number }) => e.status === code;

test("a note under the current version is one entry and bumps the version", async () => {
  const { addNote } = await svc();
  reset();
  await addNote(as("lead-a"), { concernId: "sg-qa-1", version: 3, body: "Synthetic note" });
  assert.equal(entries.length, 1);
  assert.equal(concerns[0].version, 4);
});

test("a retried or stale note is refused with 409 and writes nothing", async () => {
  const { addNote } = await svc();
  reset();
  await addNote(as("lead-a"), { concernId: "sg-qa-1", version: 3, body: "Synthetic note" });
  await assert.rejects(addNote(as("lead-a"), { concernId: "sg-qa-1", version: 3, body: "Synthetic note" }), status(409));
  assert.equal(entries.length, 1);
});

test("a missing or malformed version is a 400, not a server error, and writes nothing", async () => {
  const { addNote, escalate, closeConcern } = await svc();
  for (const version of [undefined, "", "abc", 2.5, null]) {
    reset();
    await assert.rejects(addNote(as("lead-a"), { concernId: "sg-qa-1", version, body: "Synthetic note" }), status(400));
    await assert.rejects(escalate(as("lead-a"), { concernId: "sg-qa-1", version, escalation: "INTERNAL_REVIEW", reason: "Synthetic" }), status(400));
    await assert.rejects(closeConcern(as("lead-a"), { concernId: "sg-qa-1", version, reason: "Synthetic" }), status(400));
    assert.equal(entries.length, 0);
    assert.equal(updates.length, 0);
  }
});

test("another campus or another school cannot add an entry", async () => {
  const { addNote } = await svc();
  reset();
  await assert.rejects(addNote(as("lead-a2"), { concernId: "sg-qa-1", version: 3, body: "x" }), status(404));
  await assert.rejects(addNote(as("lead-b"), { concernId: "sg-qa-1", version: 3, body: "x" }), status(404));
  assert.equal(entries.length, 0);
});
