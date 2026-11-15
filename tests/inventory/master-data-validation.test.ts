import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";

// SKAI-1466: inventory stores, categories, items, suppliers and stock transactions parse their bodies through the
// shared operations schemas. A blank, oversized or malformed value is a 400 with details and no database write; a
// recipient outside the requester's school and campus is a 404. Auth, scope and database are stubbed so the real
// route handlers and validators run.
class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
class ValidationError extends ApiError {
  fieldErrors: Record<string, string[]>;
  constructor(fieldErrors: Record<string, string[]>, message: string) { super(message, 400); this.fieldErrors = fieldErrors; }
}

type Actor = { userId: string; schoolId: string; campusId: string; role: string; fullName: string };
const schoolA: Actor = { userId: "u1", schoolId: "school-a", campusId: "campus-a", role: "CAMPUS_ADMIN", fullName: "Admin A" };
const schoolB: Actor = { userId: "u9", schoolId: "school-b", campusId: "campus-b", role: "CAMPUS_ADMIN", fullName: "Admin B" };
let actor: Actor = schoolA;
let allowedToManage = true;

mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    ValidationError,
    errorResponse: (error: unknown) => {
      if (error instanceof ApiError) return Response.json({ error: error.message, details: error instanceof ValidationError ? error.fieldErrors : undefined }, { status: error.status });
      return Response.json({ error: "Request failed" }, { status: 500 });
    },
    requireAuthUser: async () => actor,
    assertModuleRead: async () => undefined,
    canManageCampusOps: () => allowedToManage,
    resolveCampusId: async () => actor.campusId,
  },
});
mock.module("@/lib/destructive/operations", { namedExports: { operationDeleteResponse: async () => new Response(null, { status: 405 }) } });
mock.module("@/lib/lists/access", { namedExports: { assertListBudget: async () => undefined } });
mock.module("@/lib/lists/query", { namedExports: { listPagination: () => ({ page: 1, limit: 24 }), pageWindow: () => ({ page: 1, skip: 0, pages: 1 }) } });

const calls: { op: string; args: unknown }[] = [];
const writer = (model: string) => ({
  create: async (args: unknown) => { calls.push({ op: `${model}.create`, args }); return { id: "new", ...(args as { data: object }).data, category: null, stock: [] }; },
  update: async (args: unknown) => { calls.push({ op: `${model}.update`, args }); return { id: "x", ...(args as { data: object }).data }; },
  findFirst: async (args: unknown) => { calls.push({ op: `${model}.findFirst`, args }); return { id: "x", name: "Existing", campusId: actor.campusId }; },
  findMany: async () => [],
  count: async () => 0,
});
const user = {
  // The recipient exists only in school A, campus A, so any other scope is a miss.
  findFirst: async (args: { where: { id: string; schoolId: string; campusId: string } }) => {
    calls.push({ op: "user.findFirst", args });
    return args.where.id === "staff-a" && args.where.schoolId === "school-a" && args.where.campusId === "campus-a" ? { id: "staff-a" } : null;
  },
};
const fakePrisma: Record<string, unknown> = {
  itemStore: writer("itemStore"),
  itemCategory: writer("itemCategory"),
  item: { ...writer("item"), findFirst: async (args: unknown) => { calls.push({ op: "item.findFirst", args }); return { id: "item-1", campusId: actor.campusId }; } },
  supplier: writer("supplier"),
  itemTransaction: writer("itemTransaction"),
  user,
  $executeRaw: async () => 1,
};
fakePrisma.$transaction = async (work: (tx: unknown) => Promise<unknown>) => work(fakePrisma);
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });

type Route = { POST: (req: Request) => Promise<Response>; PATCH: (req: Request) => Promise<Response> };
let stores: Route, categories: Route, items: Route, suppliers: Route, transactions: Route;
before(async () => {
  stores = await import("../../src/app/api/inventory/stores/route") as unknown as Route;
  categories = await import("../../src/app/api/inventory/categories/route") as unknown as Route;
  items = await import("../../src/app/api/inventory/items/route") as unknown as Route;
  suppliers = await import("../../src/app/api/inventory/suppliers/route") as unknown as Route;
  transactions = await import("../../src/app/api/inventory/transactions/route") as unknown as Route;
});

const send = (method: "POST" | "PATCH", route: Route, body: unknown) =>
  (method === "POST" ? route.POST : route.PATCH)(new Request("http://localhost/api/inventory", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => { calls.length = 0; actor = schoolA; allowedToManage = true; });

const writes = () => calls.filter((c) => /\.(create|update)$/.test(c.op));

// Name rules shared by the four master-data routes.
const nameCases: [string, unknown][] = [
  ["whitespace only", "   "],
  ["oversized", "x".repeat(121)],
];
const masters: [string, () => Route][] = [["store", () => stores], ["category", () => categories], ["item", () => items], ["supplier", () => suppliers]];
for (const [label, pick] of masters) {
  for (const [caseLabel, value] of nameCases) {
    test(`${label} create with a ${caseLabel} name is a 400 and writes nothing`, async () => {
      const response = await send("POST", pick(), { name: value });
      assert.equal(response.status, 400);
      assert.ok((await response.json()).details?.name?.length);
      assert.deepEqual(writes(), []);
    });
    test(`${label} update with a ${caseLabel} name is a 400 and writes nothing`, async () => {
      const response = await send("PATCH", pick(), { id: "x", name: value });
      assert.equal(response.status, 400);
      assert.deepEqual(writes(), []);
    });
  }
  test(`${label} create at its documented name maximum is not refused as invalid`, async () => {
    const max = label === "item" || label === "supplier" ? 120 : label === "store" || label === "category" ? 100 : 0;
    const response = await send("POST", pick(), { name: "x".repeat(max) });
    assert.notEqual(response.status, 400);
  });
  test(`${label} create by a TEACHER-equivalent actor is refused with 403 and writes nothing`, async () => {
    allowedToManage = false;
    const response = await send("POST", pick(), { name: "Valid name" });
    assert.equal(response.status, 403);
    assert.deepEqual(writes(), []);
  });
}

test("store create with a 1000-character name is a 400", async () => {
  const response = await send("POST", stores, { name: "x".repeat(1000) });
  assert.equal(response.status, 400);
  assert.deepEqual(writes(), []);
});

test("item PATCH with a 500-character unit is a 400 and writes nothing", async () => {
  const response = await send("PATCH", items, { id: "item-1", unit: "u".repeat(500) });
  assert.equal(response.status, 400);
  assert.ok((await response.json()).details?.unit?.length);
  assert.deepEqual(writes(), []);
});

test("item create accepts a 30-character unit", async () => {
  const response = await send("POST", items, { name: "Chalk", unit: "u".repeat(30) });
  assert.equal(response.status, 201);
});

test("supplier create with a malformed email and phone is a 400 and writes nothing", async () => {
  const badEmail = await send("POST", suppliers, { name: "Acme", email: "not-an-email" });
  assert.equal(badEmail.status, 400);
  assert.ok((await badEmail.json()).details?.email?.length);
  const badPhone = await send("POST", suppliers, { name: "Acme", phone: "12" });
  assert.equal(badPhone.status, 400);
  assert.ok((await badPhone.json()).details?.phone?.length);
  assert.deepEqual(writes(), []);
});

test("supplier update with a 1000-character address is a 400 and preserves the record", async () => {
  const response = await send("PATCH", suppliers, { id: "sup-1", address: "a".repeat(1000) });
  assert.equal(response.status, 400);
  assert.deepEqual(writes(), []);
});

test("supplier PATCH with phone null clears the stored phone", async () => {
  const response = await send("PATCH", suppliers, { id: "sup-1", phone: null });
  assert.equal(response.status, 200);
  const update = calls.find((c) => c.op === "supplier.update") as { args: { data: Record<string, unknown> } };
  assert.equal(update.args.data.phone, null);
});

const txBody = (extra: Record<string, unknown>) => ({ itemId: "item-1", storeId: "store-1", kind: "ISSUE", quantity: 1, ...extra });

test("stock issue with a 501-character note is a 400 and records no movement", async () => {
  const response = await send("POST", transactions, txBody({ note: "n".repeat(501) }));
  assert.equal(response.status, 400);
  assert.ok((await response.json()).details?.note?.length);
  assert.deepEqual(writes(), []);
});

test("stock issue to a recipient in another school is a 404 and records no movement", async () => {
  actor = schoolB;
  const response = await send("POST", transactions, txBody({ issuedToUserId: "staff-a" }));
  assert.equal(response.status, 404);
  const lookup = calls.find((c) => c.op === "user.findFirst") as { args: { where: Record<string, unknown> } };
  assert.equal(lookup.args.where.schoolId, "school-b");
  assert.deepEqual(writes(), []);
});

test("stock issue to a recipient on another campus of the same school is a 404", async () => {
  actor = { ...schoolA, campusId: "campus-z" };
  const response = await send("POST", transactions, txBody({ issuedToUserId: "staff-a" }));
  assert.equal(response.status, 404);
  assert.deepEqual(writes(), []);
});

test("stock issue with a nonexistent recipient UUID is a 404", async () => {
  const response = await send("POST", transactions, txBody({ issuedToUserId: "00000000-0000-4000-8000-000000000000" }));
  assert.equal(response.status, 404);
  assert.deepEqual(writes(), []);
});
