import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-337: GET /api/ai/credits returned the whole school's AI usage (plan, credits used, per-feature requests and
// tokens, pending AI reviews) to any signed-in account, including guardians and students who have no AI features.
let current: { userId: string; role: string; schoolId: string; campusId: string | null } | null = null;
const seen: string[] = [];
mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => current } });
mock.module("@/lib/ai/openai", { namedExports: { getAICreditSnapshot: async (schoolId: string) => { seen.push(schoolId); return { used: 3, limit: 10, remaining: 7, plan: "PRO" }; } } });
mock.module("@/lib/db/prisma", { namedExports: { prisma: {
  aIUsageLog: { groupBy: async ({ where }: { where: { schoolId: string } }) => (where.schoolId === "school-a" ? [{ feature: "lesson_plan", _count: { _all: 2 }, _sum: { tokensUsed: 40 } }] : []) },
  aIReviewItem: { count: async () => 1 },
} } });

const call = async (user: typeof current) => {
  current = user;
  const { GET } = await import("../../src/app/api/ai/credits/route");
  const res = await GET();
  return { status: res.status, body: await res.json() };
};
const as = (role: string, schoolId = "school-a") => ({ userId: `u-${role}`, role, schoolId, campusId: "campus-a1" });

test("bug case: guardians and students cannot read the school's AI usage", async () => {
  for (const role of ["PARENT", "STUDENT"]) {
    const r = await call(as(role));
    assert.equal(r.status, 403, role);
    assert.equal(r.body.data, undefined, role);
  }
});

test("staff and the school owner still see their own school's credits", async () => {
  for (const role of ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ACCOUNTANT", "SUPER_ADMIN"]) {
    const r = await call(as(role));
    assert.equal(r.status, 200, role);
    assert.equal(r.body.data.remaining, 7);
    assert.equal(r.body.data.usageByFeature[0].requests, 2);
  }
});

test("two schools stay isolated and signed-out callers get 401", async () => {
  seen.length = 0;
  const r = await call(as("CAMPUS_ADMIN", "school-b"));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.usageByFeature, []);
  assert.deepEqual(seen, ["school-b"]);
  assert.equal((await call(null)).status, 401);
});
