import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

// SKAI-1858: library members are read one page at a time, and a member-card scan loads its details together.

type Member = { id: string; schoolId: string; campusId: string; memberNo: string; createdAt: Date; user: { fullName: string; role: string } };
type Text = { contains: string; mode: "insensitive" };
type MemberWhere = { schoolId?: string; campusId?: string; memberNo?: string; OR?: Array<{ memberNo?: Text; user?: { fullName: Text } }> };
type MemberFind = { where: MemberWhere; skip: number; take: number; orderBy: Array<Record<string, "asc" | "desc">>; include: Record<string, unknown> };

function members(count: number, schoolId: string, campusId: string): Member[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${campusId}-${String(i).padStart(3, "0")}`, schoolId, campusId, memberNo: `LM-${campusId}-${i}`,
    createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000), user: { fullName: i % 10 === 0 ? `Reader Zed ${i}` : `Reader ${i}`, role: "STUDENT" },
  }));
}
const all = [...members(60, "school-a", "campus-a1"), ...members(5, "school-a", "campus-a2"), ...members(8, "school-b", "campus-b1")];
const has = (value: string, text?: Text) => !!text && value.toLowerCase().includes(text.contains.toLowerCase());
function matches(row: Member, where: MemberWhere) {
  if (where.schoolId !== undefined && row.schoolId !== where.schoolId) return false;
  if (where.campusId !== undefined && row.campusId !== where.campusId) return false;
  if (where.memberNo !== undefined && row.memberNo !== where.memberNo) return false;
  if (where.OR && !where.OR.some((c) => has(row.memberNo, c.memberNo) || has(row.user.fullName, c.user?.fullName))) return false;
  return true;
}

const memberCalls: MemberFind[] = [];
let budgetCalls = 0;
let actor = { userId: "u-a", role: "LIBRARIAN", schoolId: "school-a", campusId: "campus-a1" };
let moduleReadDenied = false;
// Lookup instrumentation: how many member-detail reads are in flight at once.
let inFlight = 0, peak = 0;
const lookupWhere: Record<string, unknown>[] = [];
async function tracked<T>(where: Record<string, unknown>, value: T): Promise<T> {
  lookupWhere.push(where);
  inFlight += 1; peak = Math.max(peak, inFlight);
  await new Promise((resolve) => setTimeout(resolve, 5));
  inFlight -= 1;
  return value;
}

class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    errorResponse: (e: Error & { status?: number }) => Response.json({ success: false, error: e.message }, { status: e.status ?? 500 }),
    requireAuthUser: async () => actor,
    assertModuleRead: async () => { if (moduleReadDenied) throw new ApiError("Forbidden", 403); },
    canManageLibrary: (user: typeof actor) => user.role === "LIBRARIAN",
    assertPermission: () => undefined,
    assertStaffRole: () => undefined,
    resolveCampusId: async (user: typeof actor, requested: string | null) => requested ?? user.campusId,
  },
});
mock.module("@/lib/lists/access", { namedExports: { assertListBudget: async () => { budgetCalls += 1; } } });
mock.module("@/lib/destructive/operations", { namedExports: { operationDeleteResponse: async () => Response.json({}) } });
mock.module("@/lib/library/catalogue-command", { namedExports: { createMember: async () => ({}) } });
mock.module("@/lib/api/validate", { namedExports: { parseBody: async () => ({}) } });
mock.module("@/lib/validators/route-bodies", { namedExports: { jsonObjectBody: {} } });
mock.module("@/lib/auth/institution", { namedExports: { isCampusOperator: () => false } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async () => undefined } });
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      libraryMember: {
        count: async ({ where }: { where: MemberWhere }) => all.filter((row) => matches(row, where)).length,
        findMany: async (args: MemberFind) => {
          memberCalls.push(args);
          const sorted = all.filter((row) => matches(row, args.where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
          return sorted.slice(args.skip, args.skip + args.take).map((row) => ({ ...row, _count: { issues: 0 } }));
        },
        findFirst: async ({ where }: { where: MemberWhere }) => all.find((row) => matches(row, where)) ?? null,
      },
      // No reservation is READY past its hold, so expireHolds changes nothing.
      bookReservation: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => where.memberId ? tracked(where, [{ id: "h1", bookId: "b2", status: "WAITING", readyUntil: null }]) : [],
      },
      libraryLoanPolicy: { findFirst: async ({ where }: { where: Record<string, unknown> }) => tracked(where, null) },
      bookIssue: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => tracked(where, [
          { id: "i1", copyId: "c1", dueAt: new Date("2026-11-20"), renewals: 0, book: { title: "Atlas" } },
          { id: "i2", copyId: null, dueAt: new Date("2026-11-22"), renewals: 1, book: { title: "Botany" } },
        ]),
      },
      bookCopy: { findMany: async ({ where }: { where: Record<string, unknown> }) => tracked(where, [{ id: "c1", barcode: "AT-1" }]), findFirst: async () => null },
      libraryCharge: { findMany: async ({ where }: { where: Record<string, unknown> }) => tracked(where, [{ id: "f1", kind: "OVERDUE", amount: 500, currency: "SAR" }]) },
    },
  },
});

async function get(params: Record<string, string> = {}) {
  const { GET } = await import("@/app/api/library/members/route");
  const url = new URL("https://school.test/api/library/members");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return GET({ nextUrl: url, url: url.toString() } as never);
}

test("the members list is one bounded page with totals and a list budget", async () => {
  actor = { userId: "u-a", role: "LIBRARIAN", schoolId: "school-a", campusId: "campus-a1" };
  const before = budgetCalls;
  const body = await (await get()).json();
  assert.equal(body.data.length, 24);
  assert.deepEqual(body.pagination, { page: 1, limit: 24, total: 60, pages: 3 });
  assert.equal(budgetCalls, before + 1);
  const last = memberCalls.at(-1)!;
  assert.deepEqual(last.orderBy, [{ createdAt: "desc" }, { id: "asc" }]);
  // Active Issues still counts only open loans.
  assert.deepEqual(last.include._count, { select: { issues: { where: { returnedAt: null } } } });
});

test("every member is reachable once, newest first, and the page size is capped", async () => {
  const seen: string[] = [];
  const first = await (await get({ page: "1", limit: "500" })).json();
  assert.equal(first.pagination.limit, 100);
  seen.push(...first.data.map((row: Member) => row.id));
  assert.equal(seen.length, 60);
  assert.equal(new Set(seen).size, 60);
  assert.equal(seen[0], "campus-a1-059");
});

test("search matches the reader's name or card number", async () => {
  const byName = await (await get({ search: "zed" })).json();
  assert.equal(byName.pagination.total, 6);
  assert.ok(byName.data.every((row: Member) => row.user.fullName.includes("Zed")));
  const byCard = await (await get({ search: "LM-campus-a1-42" })).json();
  assert.deepEqual(byCard.data.map((row: Member) => row.id), ["campus-a1-042"]);
});

test("members stay inside the caller's school and campus", async () => {
  const other = await (await get({ campusId: "campus-a2" })).json();
  assert.equal(other.pagination.total, 5);
  assert.ok(other.data.every((row: Member) => row.campusId === "campus-a2"));

  actor = { userId: "u-b", role: "LIBRARIAN", schoolId: "school-b", campusId: "campus-b1" };
  const schoolB = await (await get()).json();
  assert.equal(schoolB.pagination.total, 8);
  assert.ok(schoolB.data.every((row: Member) => row.schoolId === "school-b"));
  const crossed = await (await get({ campusId: "campus-a1" })).json();
  assert.equal(crossed.pagination.total, 0);
  assert.equal(memberCalls.at(-1)!.where.schoolId, "school-b");
  actor = { userId: "u-a", role: "LIBRARIAN", schoolId: "school-a", campusId: "campus-a1" };
});

test("a role without library read access gets no members", async () => {
  moduleReadDenied = true;
  const before = memberCalls.length;
  const response = await get();
  assert.equal(response.status, 403);
  assert.equal(memberCalls.length, before);
  moduleReadDenied = false;
});

test("a member-card scan loads rules, loans, holds and charges together with the same result", async () => {
  const { lookup } = await import("@/lib/library/desk");
  peak = 0; lookupWhere.length = 0;
  const result = await lookup(actor as never, " LM-campus-a1-3 ");
  assert.ok(peak >= 4, `expected the member reads to overlap, peak was ${peak}`);
  assert.deepEqual(result, {
    kind: "MEMBER", member: { id: "campus-a1-003", memberNo: "LM-campus-a1-3", name: "Reader 3" }, maxLoans: 3,
    loans: [
      { id: "i1", title: "Atlas", barcode: "AT-1", dueAt: new Date("2026-11-20"), renewals: 0 },
      { id: "i2", title: "Botany", barcode: null, dueAt: new Date("2026-11-22"), renewals: 1 },
    ],
    reservations: [{ id: "h1", bookId: "b2", status: "WAITING", readyUntil: null }],
    openCharges: [{ id: "f1", kind: "OVERDUE", amount: 500, currency: "SAR" }],
  });
  assert.ok(lookupWhere.every((where) => where.schoolId === "school-a"), "every read keeps the school in its filter");
});

test("a scan from another school cannot find this school's member card", async () => {
  const { lookup } = await import("@/lib/library/desk");
  const other = { userId: "u-b", role: "LIBRARIAN", schoolId: "school-b", campusId: "campus-b1" };
  await assert.rejects(() => lookup(other as never, "LM-campus-a1-3"), (error: Error & { status?: number }) => error.status === 404);
});

test("browsing the catalogue does not reload categories", () => {
  const source = readFileSync("src/components/operations/index.tsx", "utf8");
  const books = source.slice(source.indexOf("function BooksTab"), source.indexOf("function MembersTab"));
  const load = books.slice(books.indexOf("const load = useCallback"), books.indexOf("useEffect("));
  assert.doesNotMatch(load, /library\/categories/);
  assert.match(books, /readRequest\("\/api\/library\/categories"\)[\s\S]*?\}, \[\]\);/);
});
