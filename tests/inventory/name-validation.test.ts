import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";

// SKAI-1424: supplier and item names are trimmed, bounded text. A number, object, blank or oversized name is a
// 400 with details, and no database call is made. The auth, scope and database layers are stubbed so the test
// exercises the real route handlers and validators.
class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
class ValidationError extends ApiError {
  fieldErrors: Record<string, string[]>;
  constructor(fieldErrors: Record<string, string[]>, message: string) { super(message, 400); this.fieldErrors = fieldErrors; }
}
const user = { userId: "u1", schoolId: "school-a", campusId: "campus-a", role: "CAMPUS_ADMIN", fullName: "Admin" };
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    ValidationError,
    errorResponse: (error: unknown) => {
      if (error instanceof ApiError) return Response.json({ error: error.message, details: error instanceof ValidationError ? error.fieldErrors : undefined }, { status: error.status });
      return Response.json({ error: "Request failed" }, { status: 500 });
    },
    requireAuthUser: async () => user,
    assertModuleRead: async () => undefined,
    canManageCampusOps: () => true,
    resolveCampusId: async () => "campus-a",
  },
});
mock.module("@/lib/destructive/operations", { namedExports: { operationDeleteResponse: async () => new Response(null, { status: 405 }) } });
mock.module("@/lib/lists/access", { namedExports: { assertListBudget: async () => undefined } });
mock.module("@/lib/lists/query", { namedExports: { listPagination: () => ({ page: 1, limit: 24 }), pageWindow: () => ({ page: 1, skip: 0, pages: 1 }) } });

const calls: string[] = [];
const record = (model: string, op: string) => async (args: { data?: { name?: string } }) => {
  calls.push(`${model}.${op}`);
  return { id: "new", name: args?.data?.name ?? "", campusId: "campus-a", category: null, stock: [] };
};
const fakeModel = (model: string) => ({ create: record(model, "create"), update: record(model, "update"), findFirst: async () => { calls.push(`${model}.findFirst`); return { id: "x", campusId: "campus-a" }; }, findMany: async () => [], count: async () => 0 });
mock.module("@/lib/db/prisma", { namedExports: { prisma: { supplier: fakeModel("supplier"), item: fakeModel("item"), itemCategory: fakeModel("itemCategory") } } });

type Route = { POST: (req: Request) => Promise<Response>; PATCH: (req: Request) => Promise<Response> };
let suppliers: Route, items: Route;
before(async () => {
  suppliers = await import("../../src/app/api/inventory/suppliers/route") as unknown as Route;
  items = await import("../../src/app/api/inventory/items/route") as unknown as Route;
});

const post = (route: Route, body: unknown) => route.POST(new Request("http://localhost/api/inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const patch = (route: Route, body: unknown) => route.PATCH(new Request("http://localhost/api/inventory", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

const badNames: [string, unknown][] = [
  ["a number", 12345],
  ["an object", { first: "x" }],
  ["an array", ["x"]],
  ["blank", "   "],
  ["oversized", "x".repeat(121)],
];

beforeEach(() => { calls.length = 0; });

for (const [label, value] of badNames) {
  for (const name of ["supplier", "item"] as const) {
    const route = () => (name === "supplier" ? suppliers : items);
    test(`${name} create with ${label} name is a 400 with details and no database call`, async () => {
      const response = await post(route(), { name: value });
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.ok(body.details?.name?.length, "the failing field is named");
      assert.deepEqual(calls, []);
    });
    test(`${name} update with ${label} name is a 400 with details and no database call`, async () => {
      const response = await patch(route(), { id: "x", name: value });
      assert.equal(response.status, 400);
      assert.ok((await response.json()).details?.name?.length);
      assert.deepEqual(calls, []);
    });
  }
}

test("a valid name is trimmed and created, and update accepts a valid name", async () => {
  const created = await post(suppliers, { name: "  Al Noor Stationers  " });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).data.name, "Al Noor Stationers");
  const updated = await patch(items, { id: "x", name: "Chalk" });
  assert.equal(updated.status, 200);
  assert.ok(calls.includes("item.update"));
});

test("a create without a name is a 400 with details", async () => {
  const response = await post(items, {});
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});
