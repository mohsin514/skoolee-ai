import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-1864: the fee overview's by-class breakdown grouped invoices per student, then loaded every billed
// student to find their class. It now groups by class in one SQL query; this checks the query keeps its
// school, campus and currency scope, makes no per-student round trip, and maps rows to the same shape.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const routeCode = transformSync(readFileSync("src/app/api/fees/campus/summary/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;

type Who = { role: string; schoolId: string; campusId: string | null };
const campusesBySchool: Record<string, string[]> = { "school-a": ["campus-a1", "campus-a2"], "school-b": ["campus-b1"] };

function fixture(who: Who, rows: unknown[]) {
  const calls = { sql: "", values: [] as unknown[], studentLookups: 0, groupBys: 0 };
  const db = {
    campus: {
      findMany: async ({ where }: { where: { schoolId: string; id?: string } }) =>
        (campusesBySchool[where.schoolId] ?? []).filter((id) => !where.id || id === where.id).map((id) => ({ id, name: id })),
    },
    $queryRaw: async (strings: TemplateStringsArray, ...params: unknown[]) => {
      calls.sql = strings.join("?");
      calls.values = params;
      return rows;
    },
    invoice: {
      aggregate: async () => ({ _sum: { totalAmount: 0, totalAmountPaid: 0, balanceDue: 0 } }),
      groupBy: async () => { calls.groupBys++; return []; },
      findMany: async () => [],
    },
    student: { findMany: async () => { calls.studentLookups++; return []; } },
    payment: { findMany: async () => [] },
  };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", routeCode)(mod, mod.exports, (id: string) => {
    if (id === "../../reports/invoice-currency") return { dominantInvoiceCurrency: async () => "PKR" };
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/locale/store") return { getLocalePackage: async () => ({ currency: "PKR" }) };
    if (id === "@/lib/locale/package") return { CURRENCIES: ["USD", "PKR"] };
    if (id === "@/lib/api/scope") return {
      requireAuthUser: async () => ({ id: "user-1", ...who }),
      assertFeesRead: async (user: Who) => {
        if (user.role === "PARENT") throw Object.assign(new Error("Forbidden"), { status: 403 });
      },
      resolveCampusId: async (user: Who, requested: string | null) => {
        if (requested && user.campusId && requested !== user.campusId) throw Object.assign(new Error("Forbidden"), { status: 403 });
        return requested ?? user.campusId;
      },
      errorResponse: (error: { status?: number }) => Response.json({ error: "denied" }, { status: error.status ?? 500 }),
    };
    return require(id);
  });
  return { calls, get: (query = "") => mod.exports.GET(new Request(`http://qa.test/api/fees/campus/summary${query}`)) };
}

test("the by-class breakdown comes from one grouped query, with no per-student lookups", async () => {
  const { calls, get } = fixture({ role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" }, [
    { className: "Four", totalDue: BigInt(40000), totalPaid: BigInt(14000) },
    { className: "Five", totalDue: BigInt(8000), totalPaid: BigInt(8000) },
    { className: "Unknown", totalDue: BigInt(0), totalPaid: BigInt(0) },
  ]);
  const res = await get();
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).data.byClass, [
    { className: "Four", totalDue: 40000, totalPaid: 14000, collectionRate: 35 },
    { className: "Five", totalDue: 8000, totalPaid: 8000, collectionRate: 100 },
    { className: "Unknown", totalDue: 0, totalPaid: 0, collectionRate: 0 },
  ]);
  assert.equal(calls.studentLookups, 0, "no IN-list of every billed student");
  assert.equal(calls.groupBys, 0, "no per-student group-by");
  assert.match(calls.sql, /GROUP BY 1/);
  assert.match(calls.sql, /COALESCE\(c\.name, 'Unknown'\)/, "groups by the student's current class, as before");
  assert.match(calls.sql, /i\.status::text <> 'CANCELLED'/, "cancelled is not a charge");
});

test("the raw query carries the caller's school, campus and currency (two schools, two campuses)", async () => {
  const a1 = fixture({ role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" }, []);
  await a1.get("?currency=USD");
  assert.match(a1.calls.sql, /WHERE i\.school_id = \? AND i\.campus_id = ANY\(\?::text\[\]\) AND i\.currency = \?/);
  assert.match(a1.calls.sql, /LEFT JOIN students s ON s\.id = i\.student_id AND s\.school_id = i\.school_id/);
  assert.deepEqual(a1.calls.values, ["school-a", ["campus-a1"], "USD"]);

  const wide = fixture({ role: "SUPER_ADMIN", schoolId: "school-a", campusId: null }, []);
  await wide.get();
  assert.deepEqual(wide.calls.values, ["school-a", ["campus-a1", "campus-a2"], "PKR"]);

  const b = fixture({ role: "ACCOUNTANT", schoolId: "school-b", campusId: "campus-b1" }, []);
  await b.get();
  assert.deepEqual(b.calls.values, ["school-b", ["campus-b1"], "PKR"]);
});

test("another campus and a family role are denied before any query runs", async () => {
  const other = fixture({ role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" }, []);
  assert.equal((await other.get("?campusId=campus-a2")).status, 403);
  assert.equal(other.calls.sql, "");
  const parent = fixture({ role: "PARENT", schoolId: "school-a", campusId: "campus-a1" }, []);
  assert.equal((await parent.get()).status, 403);
  assert.equal(parent.calls.sql, "");
});
