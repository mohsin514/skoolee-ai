import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-588: a care plan saved from a stale screen must not silently overwrite a colleague's newer save.
type Plan = { id: string; schoolId: string; campusId: string; studentId: string; updatedAt: Date } & Record<string, unknown>;
const plans: Plan[] = [], logs: Array<{ action: string }> = [];
const members: Record<string, { schoolId: string; campusId: string; role: string }> = {
  "nurse-a": { schoolId: "school-a", campusId: "campus-a1", role: "NURSE" },
  "nurse-a2": { schoolId: "school-a", campusId: "campus-a1", role: "NURSE" },
  "nurse-a-other-campus": { schoolId: "school-a", campusId: "campus-a2", role: "NURSE" },
  "nurse-b": { schoolId: "school-b", campusId: "campus-b1", role: "NURSE" },
  "clinic-staff-a": { schoolId: "school-a", campusId: "campus-a1", role: "STAFF" },
};
const students = [{ id: "kid-a", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Synthetic A" }, { id: "kid-b", schoolId: "school-b", campusId: "campus-b1", fullName: "QA Synthetic B" }];
let tick = 1_700_000_000_000;
const client = {
  confidentialMember: { findFirst: async ({ where }: { where: { userId: string; schoolId: string } }) => { const m = members[where.userId]; return m && m.schoolId === where.schoolId ? { ...m, domain: "CLINIC" } : null; } },
  confidentialSetting: { findFirst: async () => ({ enabled: true }) },
  confidentialAccessLog: { create: async ({ data }: { data: { action: string } }) => { logs.push(data); return data; } },
  student: { findFirst: async ({ where }: { where: { id: string; schoolId: string; campusId: string } }) => students.find((s) => s.id === where.id && s.schoolId === where.schoolId && s.campusId === where.campusId) ?? null },
  carePlan: {
    findFirst: async ({ where }: { where: { schoolId: string; studentId: string } }) => plans.find((p) => p.schoolId === where.schoolId && p.studentId === where.studentId) ?? null,
    upsert: async ({ where, create, update }: { where: { studentId: string }; create: Plan; update: Record<string, unknown> }) => {
      const row = plans.find((p) => p.studentId === where.studentId);
      tick += 1000;
      if (row) { Object.assign(row, update, { updatedAt: new Date(tick) }); return row; }
      const made = { ...create, id: `plan-${plans.length + 1}`, updatedAt: new Date(tick) };
      plans.push(made);
      return made;
    },
  },
};
const run = async <T>(_u: unknown, work: (tx: unknown) => Promise<T>) => work({ ...client, $executeRaw: async () => 0 });
mock.module("@/lib/db/prisma", { namedExports: { prisma: client } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: run } });

const as = (id: string) => ({ userId: id, schoolId: members[id].schoolId, campusId: members[id].campusId, role: "TEACHER" }) as never;
const reset = () => { plans.length = 0; logs.length = 0; };
const load = async () => (await import("../../src/lib/care/service")).saveCarePlan;
const status = (code: number) => (e: { status?: number }) => e.status === code;

test("saving with the version you opened succeeds and returns the new version", async () => {
  const save = await load();
  reset();
  const first = await save(as("nurse-a"), { studentId: "kid-a", allergies: "Peanuts", expectedUpdatedAt: null });
  assert.ok(first.updatedAt);
  const second = await save(as("nurse-a"), { studentId: "kid-a", allergies: "Peanuts, sesame", expectedUpdatedAt: first.updatedAt });
  assert.notEqual(second.updatedAt, first.updatedAt);
  assert.equal(plans[0].allergies, "Peanuts, sesame");
});

test("a save from a stale screen is refused with 409 and keeps the colleague's plan", async () => {
  const save = await load();
  reset();
  const opened = await save(as("nurse-a"), { studentId: "kid-a", allergies: "Peanuts", expectedUpdatedAt: null });
  await save(as("nurse-a2"), { studentId: "kid-a", allergies: "Peanuts, latex", expectedUpdatedAt: opened.updatedAt });
  await assert.rejects(save(as("nurse-a"), { studentId: "kid-a", allergies: "None", expectedUpdatedAt: opened.updatedAt }), status(409));
  assert.equal(plans[0].allergies, "Peanuts, latex");
});

test("creating a plan when a colleague already created one is refused with 409", async () => {
  const save = await load();
  reset();
  await save(as("nurse-a2"), { studentId: "kid-a", allergies: "Latex", expectedUpdatedAt: null });
  await assert.rejects(save(as("nurse-a"), { studentId: "kid-a", allergies: "None", expectedUpdatedAt: null }), status(409));
  assert.equal(plans[0].allergies, "Latex");
});

test("another school, another campus and a non-nurse member are refused", async () => {
  const save = await load();
  reset();
  await assert.rejects(save(as("nurse-b"), { studentId: "kid-a", allergies: "x", expectedUpdatedAt: null }), status(404));
  await assert.rejects(save(as("nurse-a-other-campus"), { studentId: "kid-a", allergies: "x", expectedUpdatedAt: null }), status(404));
  await assert.rejects(save(as("clinic-staff-a"), { studentId: "kid-a", allergies: "x", expectedUpdatedAt: null }), status(403));
  assert.equal(plans.length, 0);
  assert.ok(logs.some((l) => l.action === "DENIED"));
});
