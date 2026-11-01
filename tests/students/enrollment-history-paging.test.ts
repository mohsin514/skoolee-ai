import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Row = { id: string; date: Date };

function rows(count: number, prefix: string): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${String(i).padStart(3, "0")}`,
    date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000),
  }));
}

// Mirrors Prisma keyset paging: orderBy date desc, id desc; cursor row is skipped.
function pageRows(all: Row[], args: { take: number; cursor?: { id: string }; skip?: number }) {
  const sorted = [...all].sort((a, b) => b.date.getTime() - a.date.getTime() || (a.id < b.id ? 1 : -1));
  const start = args.cursor ? sorted.findIndex((r) => r.id === args.cursor!.id) + (args.skip ?? 0) : 0;
  return sorted.slice(start, start + args.take);
}

const attendance = rows(205, "att");
const counts = { attendance: attendance.length, invoices: 0, reports: 0 };

mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } },
    errorResponse: (e: Error) => Response.json({ error: e.message }, { status: 500 }),
    requireAuthUser: async () => ({ userId: "u1", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" }),
  },
});
mock.module("@/lib/auth/policy", { namedExports: { isFamily: () => false, studentScope: () => ({}) } });
mock.module("@/lib/auth/institution", { namedExports: { isInstitutionAuthority: () => false } });
mock.module("@/lib/storage/document-key-scope", { namedExports: { matchesDocumentKey: () => true } });
mock.module("@/lib/storage/private-download", { namedExports: { privateDownloadResponse: () => new Response("") } });
mock.module("@/lib/api/validate", { namedExports: { parseBody: async () => ({}) } });
mock.module("@/lib/validators/route-bodies", { namedExports: { jsonObjectBody: {} } });
mock.module("@/lib/students/enrollment", {
  namedExports: {
    applyEnrollment: async () => ({}), applyReadmission: async () => ({}), assertPlacementTarget: async () => ({}),
    assertRegistrar: async () => {}, canPlaceAcrossCampuses: () => false, dateOnly: (v: unknown) => v,
    enrollmentHistoryWhere: () => ({ attendance: {}, invoices: {}, reports: {} }),
    enrollmentImpact: async () => ({}),
    readPupil: async () => ({ enrollments: [{ id: "enr-1" }] }),
  },
});
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      attendance: {
        findMany: async (args: { take: number; cursor?: { id: string }; skip?: number }) => pageRows(attendance, args),
        count: async () => counts.attendance,
      },
      invoice: { findMany: async () => [], count: async () => 0 },
      reportCard: { findMany: async () => [], count: async () => 0 },
    },
  },
});

const loadRoute = () => import("@/app/api/students/enrollments/route");

async function get(params: Record<string, string>) {
  const { GET } = await loadRoute();
  return GET(request(params));
}

function request(params: Record<string, string>) {
  const url = new URL("https://school.test/api/students/enrollments");
  url.searchParams.set("studentId", "stu-1");
  url.searchParams.set("enrollmentId", "enr-1");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as never;
}

test("first page is bounded and returns a cursor for older attendance", async () => {
  const body = await (await get({})).json();
  assert.equal(body.attendance.length, 100);
  assert.equal(body.totals.attendance, 205);
  assert.equal(body.nextCursors.attendance, body.attendance.at(-1).id);
});

test("following the cursor reaches every historical row once", async () => {
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const body = await (await get(cursor ? { attendanceCursor: cursor } : {})).json();
    seen.push(...body.attendance.map((r: Row) => r.id));
    cursor = body.nextCursors.attendance ?? undefined;
  } while (cursor);
  assert.equal(seen.length, 205);
  assert.equal(new Set(seen).size, 205);
});
