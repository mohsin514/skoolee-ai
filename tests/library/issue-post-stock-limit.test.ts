import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2162: POST /api/library/issues takes the last copy with one conditional update, honours the reader loan limit
// under the per-reader lock, and rejects past or invalid due dates.

let body: Record<string, unknown> = {};
let copies = 1;
let openLoans = 0;
const maxLoans = 3;
const created: unknown[] = [];
const locks: string[] = [];
let updateWhere: unknown = null;

class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    errorResponse: (e: Error & { status?: number }) => Response.json({ success: false, error: e.message }, { status: e.status ?? 500 }),
    requireAuthUser: async () => ({ userId: "u", role: "LIBRARIAN", schoolId: "s", campusId: "c" }),
    assertModuleRead: async () => {},
    canManageLibrary: () => true,
    resolveCampusId: async () => "c",
  },
});
mock.module("@/lib/api/validate", { namedExports: { parseBody: async () => body } });
mock.module("@/lib/validators/route-bodies", { namedExports: { jsonObjectBody: {} } });
mock.module("@/lib/lists/query", { namedExports: { listPagination: () => ({ page: 1, limit: 50 }), pageWindow: () => ({ page: 1, skip: 0, pages: 1 }) } });
mock.module("@/lib/library/desk", { namedExports: { returnIssue: async () => ({}), currentRules: async () => ({ maxLoans }) } });
const tx = {
  $executeRaw: async (_s: TemplateStringsArray, key: string) => { locks.push(key); },
  bookIssue: { count: async () => openLoans, create: async ({ data }: { data: unknown }) => { created.push(data); return data; } },
  book: {
    updateMany: async (args: { where: { copiesAvailable: { gt: number } } }) => {
      updateWhere = args.where;
      if (copies <= args.where.copiesAvailable.gt) return { count: 0 };
      copies -= 1;
      return { count: 1 };
    },
  },
};
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      book: { findFirst: async () => ({ id: "b1" }) },
      libraryMember: { findFirst: async () => ({ id: "m1", campusId: "c" }) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  },
});

const future = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
async function post(extra: Record<string, unknown> = {}) {
  body = { bookId: "b1", memberId: "m1", dueAt: future, ...extra };
  const { POST } = await import("@/app/api/library/issues/route");
  return POST({} as never);
}

test("only one of several requests gets the last copy and stock never goes negative", async () => {
  copies = 1; openLoans = 0; created.length = 0;
  const statuses = (await Promise.all([post(), post(), post()])).map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 409, 409]);
  assert.equal(copies, 0);
  assert.equal(created.length, 1);
  assert.deepEqual(updateWhere, { id: "b1", copiesAvailable: { gt: 0 } });
});

test("the reader loan limit applies, under the per-reader lock", async () => {
  copies = 5; openLoans = 3; locks.length = 0; created.length = 0;
  const res = await post();
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /3 of 3 allowed loans/u);
  assert.deepEqual(locks, ["library-reader-loans:m1"]);
  assert.equal(copies, 5);
  assert.equal(created.length, 0);
});

test("a past or invalid due date is rejected before any write", async () => {
  copies = 5; openLoans = 0; created.length = 0;
  assert.equal((await post({ dueAt: "2020-01-01" })).status, 400);
  assert.equal((await post({ dueAt: "not-a-date" })).status, 400);
  assert.equal(copies, 5);
  assert.equal(created.length, 0);
});
