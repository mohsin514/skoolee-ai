import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";
import { NextRequest } from "next/server";

// SKAI-1820: the stock movement list returns one page of rows (names only for item/store/supplier), scoped to the
// caller's school and campus, and the library issue picker can ask the server for lendable titles only. Auth,
// scope and the database are stubbed so the real route handlers run.
class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
type Viewer = { userId: string; schoolId: string; campusId: string; role: string };
const schoolA: Viewer = { userId: "u-a", schoolId: "school-a", campusId: "campus-a1", role: "CAMPUS_ADMIN" };
const schoolB: Viewer = { userId: "u-b", schoolId: "school-b", campusId: "campus-b1", role: "CAMPUS_ADMIN" };
const parent: Viewer = { userId: "u-p", schoolId: "school-a", campusId: "campus-a1", role: "PARENT" };
let viewer = schoolA;
let budgetFamilies: string[] = [];

mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    errorResponse: (error: unknown) => error instanceof ApiError
      ? Response.json({ success: false, error: error.message }, { status: error.status })
      : Response.json({ success: false, error: "Request failed" }, { status: 500 }),
    requireAuthUser: async () => viewer,
    assertModuleRead: async (user: Viewer) => { if (user.role === "PARENT") throw new ApiError("Forbidden", 403); },
    canManageCampusOps: () => true,
    canManageLibrary: () => true,
    // A campus admin reads their own campus; a second campus in the same school is a separate scope.
    resolveCampusId: async (user: Viewer, requested?: string | null) => requested ?? user.campusId,
  },
});
mock.module("@/lib/lists/access", { namedExports: { assertListBudget: async (_user: Viewer, family: string) => { budgetFamilies.push(family); } } });
mock.module("@/lib/destructive/operations", { namedExports: { operationDeleteResponse: async () => new Response(null, { status: 405 }) } });
mock.module("@/lib/library/catalogue-command", { namedExports: { createBook: async () => ({}), updateBook: async () => ({}) } });

type Args = { where: Record<string, unknown>; skip?: number; take?: number; include?: Record<string, unknown>; orderBy?: unknown };
const calls: { model: string; op: string; args: Args }[] = [];
const ledgerSize = 260;
const fakePrisma = {
  itemTransaction: {
    count: async (args: Args) => { calls.push({ model: "itemTransaction", op: "count", args }); return ledgerSize; },
    findMany: async (args: Args) => {
      calls.push({ model: "itemTransaction", op: "findMany", args });
      return Array.from({ length: Math.min(args.take ?? ledgerSize, ledgerSize - (args.skip ?? 0)) }, (_, i) => ({ id: `t${i}` }));
    },
  },
  book: {
    count: async (args: Args) => { calls.push({ model: "book", op: "count", args }); return 3; },
    findMany: async (args: Args) => { calls.push({ model: "book", op: "findMany", args }); return []; },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });

type Get = { GET: (req: NextRequest) => Promise<Response> };
let transactions: Get, books: Get;
before(async () => {
  transactions = await import("../../src/app/api/inventory/transactions/route") as unknown as Get;
  books = await import("../../src/app/api/library/books/route") as unknown as Get;
});
beforeEach(() => { calls.length = 0; budgetFamilies = []; viewer = schoolA; });

const get = (route: Get, path: string) => route.GET(new NextRequest(`http://localhost${path}`));
const find = (model: string, op: string) => calls.find((call) => call.model === model && call.op === op)?.args;

test("movements default to one page of 24, newest first, with names only for the joined records", async () => {
  const response = await get(transactions, "/api/inventory/transactions");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 24);
  assert.deepEqual(body.pagination, { page: 1, limit: 24, total: ledgerSize, pages: 11 });
  const args = find("itemTransaction", "findMany")!;
  assert.equal(args.take, 24);
  assert.equal(args.skip, 0);
  assert.deepEqual(args.orderBy, [{ date: "desc" }, { id: "desc" }]);
  for (const relation of ["item", "store", "supplier"]) assert.deepEqual(args.include?.[relation], { select: { id: true, name: true } });
  assert.deepEqual(budgetFamilies, ["inventory/transactions"]);
});

test("a requested page is bounded to 100 rows and clamps to the last page", async () => {
  const body = await (await get(transactions, "/api/inventory/transactions?page=99&limit=5000")).json();
  assert.deepEqual(body.pagination, { page: 3, limit: 100, total: ledgerSize, pages: 3 });
  assert.equal(body.data.length, 60);
  const args = find("itemTransaction", "findMany")!;
  assert.equal(args.take, 100);
  assert.equal(args.skip, 200);
});

test("count and page share one school + campus scope, with kind and store filters kept", async () => {
  for (const [who, campus] of [[schoolA, "campus-a1"], [schoolA, "campus-a2"], [schoolB, "campus-b1"]] as const) {
    calls.length = 0; viewer = who;
    const response = await get(transactions, `/api/inventory/transactions?campusId=${campus}&kind=ISSUE&storeId=s1`);
    assert.equal(response.status, 200);
    const expected = { schoolId: who.schoolId, campusId: campus, kind: "ISSUE", storeId: "s1" };
    assert.deepEqual(find("itemTransaction", "count")!.where, expected);
    assert.deepEqual(find("itemTransaction", "findMany")!.where, expected);
  }
});

test("an invalid kind is a 400 and a denied role reads nothing", async () => {
  assert.equal((await get(transactions, "/api/inventory/transactions?kind=STEAL")).status, 400);
  assert.equal(calls.length, 0);
  viewer = parent;
  assert.equal((await get(transactions, "/api/inventory/transactions")).status, 403);
  assert.equal(calls.length, 0);
});

test("the issue picker asks for lendable titles only, within the caller's school and campus", async () => {
  await get(books, "/api/library/books?available=1&search=atlas&limit=20");
  const where = find("book", "findMany")!.where;
  assert.equal(where.schoolId, "school-a");
  assert.equal(where.campusId, "campus-a1");
  assert.deepEqual(where.copiesAvailable, { gt: 0 });
  assert.equal(find("book", "findMany")!.take, 20);
  calls.length = 0;
  await get(books, "/api/library/books");
  assert.equal(find("book", "findMany")!.where.copiesAvailable, undefined, "the catalogue view still lists every title");
});
