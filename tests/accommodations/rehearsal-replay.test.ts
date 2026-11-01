import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Plan = { id: string; schoolId: string; studentId: string; status: string; assessmentTypes: string[]; extraMinutes: number; extraPercent: number; breakMinutes: number; capabilities: Record<string, unknown>; instructions: null; validFrom: Date; validUntil: Date; version: number };
type Rehearsal = { id: string; schoolId: string; planId: string; studentId: string; settings: unknown; completedAt: Date };
let plans: Plan[] = [];
let students: Array<{ id: string; schoolId: string; studentUserId: string | null; archivedAt: null }> = [];
let rehearsals: Rehearsal[] = [];
let seq = 0;

const locks = new Map<string, Promise<void>>();
async function acquire(key: string): Promise<() => void> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  locks.set(key, previous.then(() => new Promise<void>((r) => (release = r))));
  await previous;
  return release;
}
const pause = () => new Promise((r) => setTimeout(r, 5));

function fakeTx(held: Array<() => void>) {
  return {
    student: { findFirst: async ({ where }: { where: { schoolId: string; studentUserId: string } }) => students.find((s) => s.schoolId === where.schoolId && s.studentUserId === where.studentUserId) ?? null },
    accommodationPlan: { findFirst: async ({ where }: { where: { id: string; schoolId: string; studentId: string } }) => plans.find((p) => p.id === where.id && p.schoolId === where.schoolId && p.studentId === where.studentId && p.status === "ACTIVE") ?? null },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("?").includes("FOR UPDATE")) held.push(await acquire(`plan:${values[0]}`));
      return [];
    },
    accommodationRehearsal: {
      findFirst: async ({ where }: { where: { planId: string; schoolId: string; studentId: string } }) => {
        await pause();
        return rehearsals.find((r) => r.planId === where.planId && r.schoolId === where.schoolId && r.studentId === where.studentId) ?? null;
      },
      create: async ({ data }: { data: Omit<Rehearsal, "id" | "completedAt"> }) => {
        await pause();
        const row = { id: `reh-${++seq}`, completedAt: new Date(), ...data };
        rehearsals.push(row);
        return row;
      },
    },
  };
}

const fakePrisma = {
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const held: Array<() => void> = [];
    try { return await fn(fakeTx(held)); } finally { held.forEach((release) => release()); }
  },
};

mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (tx: unknown) => Promise<unknown>) => fakePrisma.$transaction(fn) } });
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, canManageOperations: () => false } });
mock.module("@/lib/auth/policy", { namedExports: { studentScope: () => ({}) } });
mock.module("@/lib/chat/policy", { namedExports: { teacherClassIds: async () => [] } });
mock.module("@/lib/school-ai/assessment", { namedExports: { paperDataSchema: {} } });
mock.module("@/lib/school-ai/exam", { namedExports: { examAccommodationsSchema: {} } });
mock.module("@/lib/accommodations/plan", { namedExports: {
  ASSESSMENT_TYPES: ["EXAM", "ASSIGNMENT", "PRACTICE"], capabilitiesSchema: {}, needsReview: () => false, sensitiveInstructionIssue: () => null,
  effectiveSettings: ({ baseMinutes }: { baseMinutes: number }) => ({ baseMinutes, extraMinutes: 0 }),
} });

const loadService = () => import("@/lib/accommodations/service");
const student = (userId: string, schoolId = "school-a") => ({ userId, role: "STUDENT", schoolId, campusId: "campus-a" }) as never;
const confirm = async (u: unknown, planId: string) => (await loadService()).recordRehearsal(u as never, { planId, baseMinutes: 45 });

function seed() {
  plans = [
    { id: "plan-a", schoolId: "school-a", studentId: "stu-a", status: "ACTIVE", assessmentTypes: ["EXAM"], extraMinutes: 0, extraPercent: 0, breakMinutes: 0, capabilities: {}, instructions: null, validFrom: new Date(), validUntil: new Date(Date.now() + 86_400_000), version: 1 },
    { id: "plan-b", schoolId: "school-a", studentId: "stu-b", status: "ACTIVE", assessmentTypes: ["EXAM"], extraMinutes: 0, extraPercent: 0, breakMinutes: 0, capabilities: {}, instructions: null, validFrom: new Date(), validUntil: new Date(Date.now() + 86_400_000), version: 1 },
    { id: "plan-x", schoolId: "school-b", studentId: "stu-x", status: "ACTIVE", assessmentTypes: ["EXAM"], extraMinutes: 0, extraPercent: 0, breakMinutes: 0, capabilities: {}, instructions: null, validFrom: new Date(), validUntil: new Date(Date.now() + 86_400_000), version: 1 },
  ];
  students = [
    { id: "stu-a", schoolId: "school-a", studentUserId: "user-a", archivedAt: null },
    { id: "stu-b", schoolId: "school-a", studentUserId: "user-b", archivedAt: null },
    { id: "stu-x", schoolId: "school-b", studentUserId: "user-x", archivedAt: null },
  ];
  rehearsals = [];
}

test("a lost-response retry replays the original confirmation and creates no second record", async () => {
  seed();
  const first = await confirm(student("user-a"), "plan-a");
  const retry = await confirm(student("user-a"), "plan-a");
  assert.equal(retry.id, first.id);
  assert.equal(rehearsals.length, 1);
});

test("a repeated click while the first confirmation is in flight creates one record", async () => {
  seed();
  const [one, two] = await Promise.all([confirm(student("user-a"), "plan-a"), confirm(student("user-a"), "plan-a")]);
  assert.equal(one.id, two.id);
  assert.equal(rehearsals.length, 1);
});

test("only the learner can confirm, and a staff or guardian role gets 403", async () => {
  seed();
  await assert.rejects(() => confirm({ userId: "user-a", role: "PARENT", schoolId: "school-a", campusId: "campus-a" }, "plan-a"), (e: { status?: number }) => e.status === 403);
  assert.equal(rehearsals.length, 0);
});

test("a learner cannot confirm another learner's plan", async () => {
  seed();
  await assert.rejects(() => confirm(student("user-a"), "plan-b"), (e: { status?: number }) => e.status === 404);
  assert.equal(rehearsals.length, 0);
});

test("another school's plan is not found, and this school's rehearsal does not count for it", async () => {
  seed();
  await assert.rejects(() => confirm(student("user-a"), "plan-x"), (e: { status?: number }) => e.status === 404);
  await confirm(student("user-x", "school-b"), "plan-x");
  const own = await confirm(student("user-a"), "plan-a");
  assert.equal(own.planId, "plan-a");
  assert.equal(rehearsals.filter((r) => r.planId === "plan-x").length, 1);
  assert.equal(rehearsals.filter((r) => r.planId === "plan-a").length, 1);
});
