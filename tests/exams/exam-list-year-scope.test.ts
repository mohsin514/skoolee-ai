import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

// SKAI-1831: the exam boards poll GET /api/exams. `academicYear=active` and `sessionId=none` let them read only the
// active cycle's year and only exams outside a session; without the params the answer is unchanged.

type User = { userId: string; role: string; schoolId: string; campusId: string | null };
type Cycle = { schoolId: string; campusId: string; academicYear: number; status: string; createdAt: number };

const cycles: Cycle[] = [
  { schoolId: "school-a", campusId: "campus-a1", academicYear: 2026, status: "ENDED", createdAt: 1 },
  { schoolId: "school-a", campusId: "campus-a1", academicYear: 2027, status: "ACTIVE", createdAt: 2 },
  { schoolId: "school-a", campusId: "campus-a2", academicYear: 2025, status: "ACTIVE", createdAt: 1 },
  { schoolId: "school-b", campusId: "campus-b1", academicYear: 2031, status: "ACTIVE", createdAt: 1 },
];

let user: User = { userId: "u-office", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" };
const cycleQueries: Record<string, unknown>[] = [];
const examQueries: Record<string, unknown>[] = [];

mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => user } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } },
    canLeadAcademics: async () => false,
    assertSharedModuleRead: async (u: User) => {
      if (u.role === "ACCOUNTANT") throw Object.assign(new Error("Insufficient permissions"), { status: 403 });
    },
  },
});
mock.module("@/lib/billing/response", { namedExports: { billingAccessResponse: async () => null } });
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      academicCycle: {
        findFirst: async (args: { where: Partial<Cycle> }) => {
          cycleQueries.push(args.where);
          const w = args.where;
          const hit = cycles
            .filter((c) => c.schoolId === w.schoolId && c.campusId === w.campusId && c.status === w.status)
            .sort((a, b) => b.createdAt - a.createdAt)[0];
          return hit ? { academicYear: hit.academicYear } : null;
        },
      },
      exam: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          examQueries.push(args.where);
          return [];
        },
      },
      subject: { findMany: async () => [] },
      student: { findMany: async () => [{ classId: "class-1" }] },
    },
  },
});

async function get(params: Record<string, string>) {
  const { GET } = await import("@/app/api/exams/route");
  const url = new URL("https://school.test/api/exams");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await GET(new Request(url) as never);
  return { status: res.status, body: await res.json() };
}

function reset(next: User) {
  user = next;
  cycleQueries.length = 0;
  examQueries.length = 0;
}

test("academicYear=active resolves the active cycle of the requested campus inside the caller's school", async () => {
  reset({ userId: "u-office", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" });
  const a1 = await get({ campusId: "campus-a1", academicYear: "active", sessionId: "none" });
  assert.equal(a1.status, 200);
  assert.equal(a1.body.academicYear, 2027);
  assert.deepEqual(cycleQueries[0], { schoolId: "school-a", campusId: "campus-a1", status: "ACTIVE" });
  assert.deepEqual(examQueries[0].campus, { schoolId: "school-a", id: "campus-a1" });
  assert.equal(examQueries[0].academicYear, 2027);
  assert.equal(examQueries[0].sessionId, null);

  // A second campus of the same school has its own active year.
  const a2 = await get({ campusId: "campus-a2", academicYear: "active" });
  assert.equal(a2.body.academicYear, 2025);
  assert.equal(examQueries[1].academicYear, 2025);
  assert.equal("sessionId" in examQueries[1], false);
});

test("another school's campus id never borrows that school's cycle year", async () => {
  reset({ userId: "u-office", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" });
  const res = await get({ campusId: "campus-b1", academicYear: "active" });
  assert.equal(res.body.academicYear, null);
  assert.deepEqual(cycleQueries[0], { schoolId: "school-a", campusId: "campus-b1", status: "ACTIVE" });
  assert.deepEqual(examQueries[0].campus, { schoolId: "school-a", id: "campus-b1" });
  assert.equal("academicYear" in examQueries[0], false);

  reset({ userId: "u-b", role: "ADMIN", schoolId: "school-b", campusId: "campus-b1" });
  const b = await get({ academicYear: "active" });
  assert.equal(b.body.academicYear, 2031);
  assert.deepEqual(examQueries[0].campus, { schoolId: "school-b", id: "campus-b1" });
});

test("no param, an explicit year and a campus without an active cycle keep the old answers", async () => {
  reset({ userId: "u-office", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" });
  const plain = await get({});
  assert.equal(plain.body.academicYear, null);
  assert.equal(cycleQueries.length, 0, "no cycle lookup unless asked");
  assert.equal("academicYear" in examQueries[0], false);
  assert.equal("sessionId" in examQueries[0], false);

  const explicit = await get({ academicYear: "2026", sessionId: "sess-1" });
  assert.equal(explicit.body.academicYear, 2026);
  assert.equal(examQueries[1].academicYear, 2026);
  assert.equal(examQueries[1].sessionId, "sess-1");

  reset({ userId: "u-c", role: "ADMIN", schoolId: "school-a", campusId: "campus-none" });
  const none = await get({ academicYear: "active" });
  assert.equal(none.body.academicYear, null);
  assert.equal("academicYear" in examQueries[0], false);
});

test("families keep their audience rules and a denied role still gets nothing", async () => {
  reset({ userId: "u-parent", role: "PARENT", schoolId: "school-a", campusId: "campus-a1" });
  await get({ academicYear: "active" });
  assert.deepEqual(examQueries[0].classId, { in: ["class-1"] });
  assert.deepEqual(examQueries[0].status, { not: "DRAFT" });
  assert.equal(examQueries[0].academicYear, 2027);

  reset({ userId: "u-acc", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" });
  const denied = await get({ academicYear: "active" });
  assert.notEqual(denied.status, 200);
  assert.equal(examQueries.length, 0);
  assert.equal(cycleQueries.length, 0);
});

test("both polling exam boards ask for the active year, and the workspace skips session exams", () => {
  const workspace = readFileSync("src/components/academic/exams/ExamsWorkspace.tsx", "utf8");
  assert.match(workspace, /sessionId: "none", \.\.\.\(allYears \? \{\} : \{ academicYear: "active" \}\)/);
  assert.match(workspace, /fetch\(`\/api\/exams\?\$\{examQs\}`/);
  const board = readFileSync("src/components/academic/ExamCycleManager.tsx", "utf8");
  assert.match(board, /if \(!allYears\) examParams\.set\("academicYear", "active"\);/);
  assert.match(board, /fetch\(`\/api\/exams\?\$\{examParams\}`\)/);
});
