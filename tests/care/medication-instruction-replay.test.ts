import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-590: a retried or double-clicked medication instruction is one instruction, one audit row; scope and role are kept.
type Visit = Record<string, unknown> & { id: string };
const visits: Visit[] = [], logs: Array<{ action: string }> = [];
const locks = new Map<string, Promise<void>>();
const members: Record<string, { schoolId: string; campusId: string; role: string }> = {
  "nurse-a": { schoolId: "school-a", campusId: "campus-a1", role: "NURSE" },
  "nurse-a2": { schoolId: "school-a", campusId: "campus-a2", role: "NURSE" },
  "nurse-b": { schoolId: "school-b", campusId: "campus-b1", role: "NURSE" },
  "aide-a": { schoolId: "school-a", campusId: "campus-a1", role: "AIDE" },
};
const students = [{ id: "kid-a", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Synthetic A" }, { id: "kid-b", schoolId: "school-b", campusId: "campus-b1", fullName: "QA Synthetic B" }];
const same = (row: Visit, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => v instanceof Date ? (row[k] as Date)?.getTime() === v.getTime() : (row[k] ?? null) === v);
const client = {
  confidentialMember: { findFirst: async ({ where }: { where: { userId: string; schoolId: string } }) => { const m = members[where.userId]; return m && m.schoolId === where.schoolId ? { ...m, domain: "CLINIC" } : null; } },
  confidentialSetting: { findFirst: async () => ({ enabled: true }) },
  confidentialAccessLog: { create: async ({ data }: { data: { action: string } }) => { logs.push(data); return data; } },
  student: { findFirst: async ({ where }: { where: { id: string; schoolId: string; campusId: string } }) => students.find((s) => s.id === where.id && s.schoolId === where.schoolId && s.campusId === where.campusId) ?? null },
  medicationInstruction: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => visits.find((v) => same(v, where)) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => { await new Promise((r) => setTimeout(r, 5)); const row = { id: `i${visits.length + 1}`, ...data }; visits.push(row); return row; },
  },
};
const run = async <T>(_u: unknown, work: (tx: unknown) => Promise<T>) => {
  let release = () => {};
  const tx = { ...client, $executeRaw: async (_s: TemplateStringsArray, key: string) => {
    while (locks.has(key)) await locks.get(key);
    locks.set(key, new Promise<void>((r) => { release = () => { locks.delete(key); r(); }; }));
  } };
  try { return await work(tx); } finally { release(); }
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: client } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: run } });

const as = (id: string) => ({ userId: id, schoolId: members[id].schoolId, campusId: members[id].campusId, role: "TEACHER" }) as never;
const body = { studentId: "kid-a", medicine: "Synthetic syrup", dose: "5 ml", schedule: "After lunch", authorizedBy: "QA Doctor", authorizationRef: "QA-REF-1", validFrom: "2026-11-01T00:00:00.000Z", validUntil: "2026-12-01T00:00:00.000Z" };
const reset = () => { visits.length = 0; logs.length = 0; };
const load = async () => (await import("../../src/lib/care/service")).addInstruction;
const status = (code: number) => (e: { status?: number }) => e.status === code;

test("a lost-response retry replays the same instruction", async () => {
  const record = await load();
  reset();
  const a = await record(as("nurse-a"), body), b = await record(as("nurse-a"), body);
  assert.equal(b.id, a.id);
  assert.equal(visits.length, 1);
  assert.equal(logs.filter((l) => l.action === "CREATE").length, 1);
});

test("a double click (two at once) serialises into one instruction", async () => {
  const record = await load();
  reset();
  const [x, y] = await Promise.all([record(as("nurse-a"), body), record(as("nurse-a"), body)]);
  assert.equal(x.id, y.id);
  assert.equal(visits.length, 1);
});

test("a different instruction is a new row", async () => {
  const record = await load();
  reset();
  await record(as("nurse-a"), body);
  await record(as("nurse-a"), { ...body, dose: "10 ml" });
  assert.equal(visits.length, 2);
});

test("another school and another campus cannot record against the student", async () => {
  const record = await load();
  reset();
  await assert.rejects(record(as("nurse-b"), body), status(404));
  await assert.rejects(record(as("nurse-a2"), body), status(404));
  await assert.rejects(record(as("aide-a"), body), status(403));
  assert.equal(visits.length, 0);
});

test("an instruction that was ended is not replayed; re-adding creates a new one", async () => {
  const record = await load();
  reset();
  await record(as("nurse-a"), body);
  visits[0].endedAt = new Date();
  await record(as("nurse-a"), body);
  assert.equal(visits.length, 2);
});
