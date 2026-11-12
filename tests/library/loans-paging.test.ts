import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1825: GET /api/library/issues returns one page of a campus's loans, never the whole history.

type Loan = { id: string; schoolId: string; campusId: string; issuedAt: Date; dueAt: Date; returnedAt: Date | null };
type Where = { schoolId?: string; book?: { campusId?: string }; returnedAt?: null | { not: null } };
type FindArgs = { where: Where; skip: number; take: number; orderBy: Array<Record<string, "asc" | "desc">>; select: Record<string, unknown> };

const day = 86_400_000;
function loans(count: number, schoolId: string, campusId: string): Loan[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${campusId}-${String(i).padStart(3, "0")}`, schoolId, campusId,
    issuedAt: new Date(Date.UTC(2026, 0, 1) + i * day),
    dueAt: new Date(Date.UTC(2026, 6, 1) - i * day),
    returnedAt: i % 3 === 0 ? new Date(Date.UTC(2026, 2, 1)) : null,
  }));
}
const all = [...loans(130, "school-a", "campus-a1"), ...loans(7, "school-a", "campus-a2"), ...loans(40, "school-b", "campus-b1")];

function matches(row: Loan, where: Where) {
  if (where.schoolId !== undefined && row.schoolId !== where.schoolId) return false;
  if (where.book?.campusId !== undefined && row.campusId !== where.book.campusId) return false;
  if (where.returnedAt === null && row.returnedAt !== null) return false;
  if (where.returnedAt && "not" in where.returnedAt && row.returnedAt === null) return false;
  return true;
}
function sortBy(order: FindArgs["orderBy"]) {
  return (a: Loan, b: Loan) => {
    for (const clause of order) {
      const [key, dir] = Object.entries(clause)[0] as [keyof Loan, "asc" | "desc"];
      const x = a[key] instanceof Date ? (a[key] as Date).getTime() : String(a[key]);
      const y = b[key] instanceof Date ? (b[key] as Date).getTime() : String(b[key]);
      if (x !== y) return (x < y ? -1 : 1) * (dir === "asc" ? 1 : -1);
    }
    return 0;
  };
}

const calls: FindArgs[] = [];
let actor = { userId: "u-a", role: "LIBRARIAN", schoolId: "school-a", campusId: "campus-a1" };
let moduleReadDenied = false;

mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } },
    errorResponse: (e: Error & { status?: number }) => Response.json({ success: false, error: e.message }, { status: e.status ?? 500 }),
    requireAuthUser: async () => actor,
    assertModuleRead: async () => { if (moduleReadDenied) throw Object.assign(new Error("Forbidden"), { status: 403 }); },
    canManageLibrary: () => true,
    resolveCampusId: async (user: typeof actor, requested: string | null) => requested ?? user.campusId,
  },
});
mock.module("@/lib/api/validate", { namedExports: { parseBody: async () => ({}) } });
mock.module("@/lib/validators/route-bodies", { namedExports: { jsonObjectBody: {} } });
mock.module("@/lib/library/desk", { namedExports: { returnIssue: async () => ({}) } });
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      bookIssue: {
        count: async ({ where }: { where: Where }) => all.filter((row) => matches(row, where)).length,
        findMany: async (args: FindArgs) => {
          calls.push(args);
          return all.filter((row) => matches(row, args.where)).sort(sortBy(args.orderBy)).slice(args.skip, args.skip + args.take);
        },
      },
    },
  },
});

async function get(params: Record<string, string> = {}) {
  const { GET } = await import("@/app/api/library/issues/route");
  const url = new URL("https://school.test/api/library/issues");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return GET({ nextUrl: url, url: url.toString() } as never);
}

test("the default response is one bounded page with totals", async () => {
  actor = { ...actor, schoolId: "school-a", campusId: "campus-a1" };
  const body = await (await get()).json();
  assert.equal(body.data.length, 50);
  assert.deepEqual(body.pagination, { page: 1, limit: 50, total: 130, pages: 3 });
  const last = calls.at(-1)!;
  assert.equal(last.where.schoolId, "school-a");
  assert.equal(last.where.book?.campusId, "campus-a1");
  assert.deepEqual(Object.keys(last.select).sort(), ["book", "bookId", "dueAt", "id", "issuedAt", "member", "memberId", "returnedAt"]);
});

test("the page size is capped and every loan is reachable once, newest first", async () => {
  const seen: string[] = [];
  for (let page = 1; page <= 2; page += 1) {
    const body = await (await get({ page: String(page), limit: "500" })).json();
    assert.equal(body.pagination.limit, 100);
    seen.push(...body.data.map((row: Loan) => row.id));
  }
  assert.equal(seen.length, 130);
  assert.equal(new Set(seen).size, 130);
  assert.equal(seen[0], "campus-a1-129");
});

test("open loans are ordered by due date and keep the status filter", async () => {
  const body = await (await get({ status: "issued" })).json();
  assert.ok(body.data.every((row: Loan) => row.returnedAt === null));
  assert.equal(body.pagination.total, 130 - 44);
  assert.deepEqual(calls.at(-1)!.orderBy, [{ dueAt: "asc" }, { id: "asc" }]);
  const returned = await (await get({ status: "returned" })).json();
  assert.equal(returned.pagination.total, 44);
});

test("loans stay inside the caller's school and campus", async () => {
  const other = await (await get({ campusId: "campus-a2" })).json();
  assert.equal(other.pagination.total, 7);
  assert.ok(other.data.every((row: Loan) => row.id.startsWith("campus-a2-")));

  actor = { userId: "u-b", role: "LIBRARIAN", schoolId: "school-b", campusId: "campus-b1" };
  const schoolB = await (await get()).json();
  assert.equal(schoolB.pagination.total, 40);
  assert.ok(schoolB.data.every((row: Loan) => row.schoolId === "school-b"));
  // A campus id from another school cannot pull that school's loans: schoolId is always in the filter.
  const crossed = await (await get({ campusId: "campus-a1" })).json();
  assert.equal(crossed.pagination.total, 0);
  assert.equal(calls.at(-1)!.where.schoolId, "school-b");
});

test("a role without library read access gets no loans", async () => {
  moduleReadDenied = true;
  const before = calls.length;
  const response = await get();
  assert.equal(response.status, 403);
  assert.equal(calls.length, before);
  moduleReadDenied = false;
});
