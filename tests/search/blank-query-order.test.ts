import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { Prisma } from "@prisma/client";

// SKAI-1740: a blank query put the constant `false` straight into ORDER BY, which PostgreSQL rejects
// (42601 "non-integer constant in ORDER BY"), so pupils could never be browsed without search text.
const queries: Prisma.Sql[] = [];
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = Prisma.sql(strings, ...values);
        queries.push(sql);
        return sql.sql.includes("count(*)") ? [{ total: BigInt(0) }] : [];
      },
      student: { findMany: async () => [] },
      class: { findMany: async () => [], count: async () => 0 },
      user: { findMany: async () => [], count: async () => 0 },
      admissionApplication: { findMany: async () => [], count: async () => 0 },
      school: { findUnique: async () => ({ name: "QA-01 School" }) },
      campus: { findUnique: async () => ({ name: "QA-01 Campus" }), findFirst: async () => ({ id: "campus-a" }) },
      teacherClass: { findMany: async () => [] },
    },
  },
});
const denied = new Set<string>();
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } },
    isFamilyRole: () => false,
    assertModuleRead: async (user: { role: string }) => { if (denied.has(user.role)) throw new Error("denied"); },
  },
});

const load = () => import("../../src/lib/search/service");
const admin = (schoolId: string, campusId: string) => ({ userId: `admin-${schoolId}`, schoolId, campusId, role: "CAMPUS_ADMIN" }) as never;
const pupilQuery = () => queries.find(sql => sql.sql.includes("FROM students") && sql.sql.includes("ORDER BY"))!;
const orderBy = (sql: Prisma.Sql) => sql.sql.slice(sql.sql.indexOf("ORDER BY"), sql.sql.indexOf("LIMIT"));

test("blank pupil query orders by columns only, never a bare constant", async () => {
  const { searchRecords, parseFilters } = await load();
  queries.length = 0;
  const data = await searchRecords(admin("school-a", "campus-a"), parseFilters(new URLSearchParams("types=student")));
  assert.equal(data.partial, false);
  assert.equal(data.sources.student, "ok");
  const order = orderBy(pupilQuery());
  assert.doesNotMatch(order, /\bfalse\b/i);
  assert.match(order, /^ORDER BY\s+s\.archived_at IS NOT NULL, search_fold\(s\.full_name\) ASC, s\.roll_no, s\.id\s*$/);
});

test("non-empty query keeps exact identifiers first", async () => {
  const { searchRecords, parseFilters } = await load();
  queries.length = 0;
  await searchRecords(admin("school-a", "campus-a"), parseFilters(new URLSearchParams("types=student&q=QA01-UX-30&sort=name-desc")));
  const sql = pupilQuery();
  assert.match(orderBy(sql), /^ORDER BY \(lower\(s\.roll_no\) = lower\(\?\).*\) DESC,\s+s\.archived_at IS NOT NULL, search_fold\(s\.full_name\) DESC/);
  assert.ok(sql.values.includes("QA01-UX-30"));
});

test("blank query stays scoped to the caller's school", async () => {
  const { searchRecords, parseFilters } = await load();
  for (const school of ["school-a", "school-b"]) {
    queries.length = 0;
    await searchRecords(admin(school, `campus-${school}`), parseFilters(new URLSearchParams("types=student")));
    const sql = pupilQuery();
    assert.match(sql.sql, /s\.school_id = \?/);
    assert.equal(sql.values[0], school);
    assert.ok(!sql.values.includes(school === "school-a" ? "school-b" : "school-a"));
  }
});

test("a family role cannot run record search", async () => {
  const { searchRecords, parseFilters } = await load();
  queries.length = 0;
  await assert.rejects(searchRecords({ userId: "p", schoolId: "school-a", campusId: "campus-a", role: "PARENT" } as never, parseFilters(new URLSearchParams("types=student"))));
  assert.equal(queries.length, 0);
});
