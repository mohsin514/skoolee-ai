import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1867: the owner pickers read GET /api/owner/schools?view=options, which keeps the owner check,
// the list budget, filters, order and paging, but asks for no per-campus counts.
type Row = { id: string; name: string; plan: string; status: string; createdAt: Date; campuses: { id: string; name: string }[] };
const schools: Row[] = [
  { id: "school-a", name: "QA-01 Alpha", plan: "FREE", status: "ACTIVE", createdAt: new Date(1), campuses: [{ id: "campus-a1", name: "A main" }, { id: "campus-a2", name: "A north" }] },
  { id: "school-b", name: "QA-01 Beta", plan: "PRO", status: "TRIAL", createdAt: new Date(2), campuses: [{ id: "campus-b1", name: "B main" }] },
];
const calls: Array<Record<string, unknown>> = [];
let caller: { role: string } | null = { role: "APP_OWNER" };
const budgets: string[] = [];

class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
const db = {
  school: {
    count: async ({ where }: { where: { status?: string } }) => schools.filter((s) => !where.status || s.status === where.status).length,
    findMany: async (args: { where: { status?: string }; select?: Record<string, unknown>; include?: Record<string, unknown>; skip: number; take: number }) => {
      calls.push(args);
      return [...schools].filter((s) => !args.where.status || s.status === args.where.status)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(args.skip, args.skip + args.take)
        .map(({ id, name, plan, campuses }) => ({ id, name, plan, campuses }));
    },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: db, RLS_ENABLED: false } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    requirePlatformOwner: async () => { if (!caller) throw new ApiError("Unauthorized", 401); if (caller.role !== "APP_OWNER") throw new ApiError("Forbidden", 403); return caller; },
    errorResponse: (error: { message: string; status?: number }) => Response.json({ success: false, error: error.message }, { status: error.status ?? 500 }),
  },
});
mock.module("@/lib/lists/access", { namedExports: { assertListBudget: async (_user: unknown, key: string) => { budgets.push(key); } } });

const get = async (query: string) => {
  const { GET } = await import("@/app/api/owner/schools/route");
  const response = await GET(new Request(`http://localhost/api/owner/schools?${query}`) as never);
  return { status: response.status, json: await response.json() };
};

test("the options view returns every school's campuses with no per-campus counts, in the list's order", async () => {
  caller = { role: "APP_OWNER" }; calls.length = 0; budgets.length = 0;
  const { status, json } = await get("view=options&limit=100&page=1");
  assert.equal(status, 200);
  assert.deepEqual(json.data.map((s: Row) => [s.id, s.campuses.map((c) => c.id)]), [["school-b", ["campus-b1"]], ["school-a", ["campus-a1", "campus-a2"]]]);
  assert.deepEqual(json.pagination, { page: 1, limit: 100, total: 2, pages: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].include, undefined);
  assert.ok(!JSON.stringify(calls[0].select).includes("_count"), "no student, staff or class counts are asked for");
  assert.deepEqual(budgets, ["owner/schools"], "the options view still spends the list budget");
});

test("the options view keeps the list filters and paging", async () => {
  caller = { role: "APP_OWNER" }; calls.length = 0;
  const filtered = await get("view=options&status=active");
  assert.deepEqual(filtered.json.data.map((s: Row) => s.id), ["school-a"]);
  const paged = await get("view=options&limit=1&page=2");
  assert.deepEqual(paged.json.data.map((s: Row) => s.id), ["school-a"]);
  assert.deepEqual(paged.json.pagination, { page: 2, limit: 1, total: 2, pages: 2 });
});

test("the default view still carries the per-campus counts", async () => {
  caller = { role: "APP_OWNER" }; calls.length = 0;
  await get("limit=100").catch(() => undefined);
  assert.ok(JSON.stringify(calls[0].include).includes("_count"));
});

test("school roles and signed-out callers are refused before any school is read", async () => {
  calls.length = 0;
  caller = { role: "SUPER_ADMIN" };
  assert.equal((await get("view=options")).status, 403);
  caller = null;
  assert.equal((await get("view=options")).status, 401);
  assert.equal(calls.length, 0);
});
