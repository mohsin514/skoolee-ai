/**
 * SKAI-1866: GET /api/navigation/counts serves the approval breakdown the group Today view used to rebuild from the
 * support-grants list and the whole policy library. Pins that the badge `counts` stay numbers, that each count keeps
 * the caller's school (two schools), that a failed source is flagged rather than shown as "nothing pending", and that a
 * role outside the institution authority gets no breakdown.
 */
import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

type User = { userId: string; schoolId: string; campusId: string | null; role: string; institutionKind: "GROUP" | "SINGLE" };
const state = { user: null as User | null, failing: new Set<string>(), wheres: [] as Array<{ model: string; schoolId: unknown }> };
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

mock.module("@/lib/db/prisma", { namedExports: { prisma: { supportGrant: counter("supportGrant"), taxActivation: counter("taxActivation"), policyOverride: counter("policyOverride") } } });
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
mock.module("@/lib/principal/queue", { namedExports: { collectSources: async () => ({ items: [] }) } });

const groupAdmin = (schoolId: string): User => ({ userId: `admin-${schoolId}`, schoolId, campusId: null, role: "SUPER_ADMIN", institutionKind: "GROUP" });
const read = async () => {
  const { GET } = await import("../../src/app/api/navigation/counts/route");
  return (await GET()).json();
};

beforeEach(() => { state.failing = new Set(); state.wheres = []; console.warn = () => undefined; });

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
