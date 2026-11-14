/**
 * SKAI-1866: GET /api/navigation/counts serves the approval breakdown the group Today view used to rebuild from the
 * support-grants list and the whole policy library. Pins that the badge `counts` stay numbers, that each count keeps
 * the caller's school (two schools), that a failed source is flagged rather than shown as "nothing pending", and that a
 * role outside the institution authority gets no breakdown.
 */
import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

type User = { userId: string; schoolId: string; campusId: string | null; role: string; institutionKind: "GROUP" | "SINGLE" };
const state = { user: null as User | null, failing: new Set<string>(), wheres: [] as Array<{ model: string; schoolId: unknown }>, queueItems: 0, queueRuns: 0, queueFails: false, queueFailed: [] as string[] };
const PENDING: Record<string, Record<string, number>> = {
  supportGrant: { "school-a": 2, "school-b": 5 },
  taxActivation: { "school-a": 1, "school-b": 0 },
  policyOverride: { "school-a": 3, "school-b": 4 },
};
const counter = (model: string) => ({
  count: async ({ where }: { where: { schoolId: string } }) => {
    state.wheres.push({ model, schoolId: where.schoolId });
    if (state.failing.has(model)) throw new Error(`synthetic ${model} outage`);
    return PENDING[model][where.schoolId] ?? 0;
  },
});

mock.module("@/lib/db/prisma", { namedExports: { prisma: { supportGrant: counter("supportGrant"), taxActivation: counter("taxActivation"), policyOverride: counter("policyOverride"), queueItemState: { findMany: async () => [] } } } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class extends Error {},
    errorResponse: (error: unknown) => { throw error; },
    requireAuthUser: async () => state.user,
    requirePlatformOwner: async () => undefined,
  },
});
mock.module("@/lib/auth/institution", {
  namedExports: {
    isInstitutionAuthority: (user: User) => user.role === "SUPER_ADMIN",
    kindFor: (user: User) => user.institutionKind,
  },
});
mock.module("@/lib/principal/queue", {
  namedExports: {
    collectSources: async () => {
      state.queueRuns++;
      if (state.queueFails) throw new Error("synthetic queue outage");
      return { items: Array.from({ length: state.queueItems }, (_, i) => ({ key: `ITEM:${i}` })), failed: state.queueFailed };
    },
  },
});

const groupAdmin = (schoolId: string): User => ({ userId: `admin-${schoolId}`, schoolId, campusId: null, role: "SUPER_ADMIN", institutionKind: "GROUP" });
const read = async () => {
  const { GET } = await import("../../src/app/api/navigation/counts/route");
  return (await GET()).json();
};

beforeEach(() => { state.failing = new Set(); state.wheres = []; state.queueItems = 0; state.queueRuns = 0; state.queueFails = false; state.queueFailed = []; console.warn = () => undefined; });

test("the group authority gets the breakdown beside unchanged numeric badge counts, per school", async () => {
  for (const [schoolId, support, tax, overrides] of [["school-a", 2, 1, 3], ["school-b", 5, 0, 4]] as const) {
    state.user = groupAdmin(schoolId); state.wheres = [];
    const body = await read();
    assert.deepEqual(body.counts, { approvals: support + tax + overrides, queue: 0 });
    assert.deepEqual(body.approvalBreakdown, { support, tax, overrides, failed: false });
    assert.equal(state.wheres.length, 3);
    for (const where of state.wheres) assert.equal(where.schoolId, schoolId, `${where.model} keeps the caller's school`);
  }
});

test("a failed source is flagged, so the overview says the counts could not be loaded", async () => {
  state.user = groupAdmin("school-a");
  state.failing = new Set(["policyOverride"]);
  const body = await read();
  assert.equal(body.counts.approvals, 3);
  assert.equal(body.approvalBreakdown.failed, true);
});

test("a role outside the institution authority gets no breakdown and reads no approval source", async () => {
  state.user = { userId: "teacher", schoolId: "school-a", campusId: "campus-a", role: "TEACHER", institutionKind: "GROUP" };
  const body = await read();
  assert.deepEqual(body.counts, { approvals: 0, queue: 0 });
  assert.equal(body.approvalBreakdown, undefined);
  assert.equal(state.wheres.length, 0);
});

test("SKAI-1973: approval counts are live — a change shows on the very next read, and a recovered source clears the failure", async () => {
  state.user = groupAdmin("school-b");
  assert.equal((await read()).counts.approvals, 9);
  PENDING.supportGrant["school-b"] = 4;
  try {
    assert.equal((await read()).counts.approvals, 8, "an approval is reflected at once");
    state.failing = new Set(["supportGrant"]);
    assert.equal((await read()).approvalBreakdown.failed, true);
    state.failing = new Set();
    assert.equal((await read()).approvalBreakdown.failed, false, "the failure is not pinned for a minute");
  } finally { PENDING.supportGrant["school-b"] = 5; }
});

const campusAdmin = (userId: string, schoolId: string): User => ({ userId, schoolId, campusId: `campus-${schoolId}`, role: "CAMPUS_ADMIN", institutionKind: "SINGLE" });

test("SKAI-1973: the queue badge is memoised per user, and a failed rebuild is shown as 0 but not remembered", async () => {
  state.user = campusAdmin("admin-1", "school-q");
  state.queueFails = true;
  assert.equal((await read()).counts.queue, 0, "a failing queue does not fail the shell");
  await new Promise((resolve) => setImmediate(resolve));
  state.queueFails = false; state.queueItems = 2;
  assert.equal((await read()).counts.queue, 2, "the failure was not cached");
  const runs = state.queueRuns;
  state.queueItems = 5;
  assert.equal((await read()).counts.queue, 2, "the same user within the window reuses the badge");
  assert.equal(state.queueRuns, runs);
  state.user = campusAdmin("admin-2", "school-q");
  assert.equal((await read()).counts.queue, 5, "another user with the same role and access version has their own entry");
  state.user = campusAdmin("admin-1", "school-r");
  assert.equal((await read()).counts.queue, 5, "another school has its own entry");
});

test("SKAI-1973: a rebuild with a failed queue source shows what loaded but is not remembered", async () => {
  state.user = campusAdmin("admin-3", "school-p");
  state.queueItems = 1; state.queueFailed = ["ATTENDANCE_MISSING"];
  assert.equal((await read()).counts.queue, 1, "the partial count is still shown");
  await new Promise((resolve) => setImmediate(resolve));
  state.queueItems = 4; state.queueFailed = [];
  assert.equal((await read()).counts.queue, 4, "the partial result was not cached");
  state.queueItems = 6;
  assert.equal((await read()).counts.queue, 4, "a complete result is cached");
});
