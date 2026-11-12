import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-391: the collection report's "overdue" column counted every unpaid balance, including invoices
// that are not due yet, so it contradicted the defaulters report. Only a balance past its due date is overdue.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const compile = (path: string) => transformSync(readFileSync(path, "utf8"), { loader: "ts", format: "cjs" }).code;
const routeCode = compile("src/app/api/fees/reports/collection/route.ts");
const day = 86_400_000;

// SKAI-1826: the rules now run in SQL (tests/fees/report-collection-sql.database.test.ts proves the totals on a
// real database); this checks the query keeps them and its tenant scope, and that rows map to the report shape.
let sql = "", values: unknown[] = [], groupByArgs: any = null;
function fixture() {
  const db = {
    campus: { findMany: async () => [{ id: "campus-a" }] },
    $queryRaw: async (strings: TemplateStringsArray, ...params: unknown[]) => {
      sql = strings.join("?");
      values = params;
      return [{ classKey: "class-a", className: "Year 1 A", totalStudents: BigInt(4), totalDue: BigInt(40000), totalPaid: BigInt(14000), totalOverdue: BigInt(16000) }];
    },
    payment: { groupBy: async (args: unknown) => { groupByArgs = args; return [{ paymentMethod: "CASH", _sum: { amount: 14000 }, _count: { _all: 2 } }]; } },
  };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", routeCode)(mod, mod.exports, (id: string) => {
    if (id === "../invoice-currency") return { dominantInvoiceCurrency: async () => "PKR" };
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/locale/store") return { getLocalePackage: async () => ({ currency: "PKR" }) };
    if (id === "@/lib/locale/package") return { CURRENCIES: ["USD", "PKR"] };
    if (id === "@/lib/api/scope") return {
      requireAuthUser: async () => ({ role: "ACCOUNTANT", schoolId: "school-a" }),
      assertFeesRead: async () => {}, resolveCampusId: async () => "campus-a",
      errorResponse: (error: unknown) => { throw error; },
    };
    return require(id);
  });
  return () => mod.exports.GET(new Request("http://qa.test/api/fees/reports/collection"));
}

test("overdue counts only balances past their due date; not-yet-due, paid and cancelled invoices are excluded", async () => {
  const res = await fixture()();
  assert.equal(res.status, 200);
  const { byClass, byMethod } = (await res.json()).data;
  assert.deepEqual(byClass, [{ currency: "PKR", className: "Year 1 A", totalStudents: 4, totalDue: 40000, totalPaid: 14000, totalOverdue: 16000, collectionRate: 35 }]);
  assert.deepEqual(byMethod, [{ currency: "PKR", method: "CASH", count: 2, total: 14000, percentage: 100 }]);
  assert.match(sql, /i\.status::text <> 'CANCELLED'/, "cancelled is not a charge");
  assert.match(sql, /FILTER \(\s*WHERE i\.status::text IN \('PENDING', 'PARTIAL', 'OVERDUE'\) AND i\.balance_due > 0\s+AND i\.due_date < \(\?::timestamptz AT TIME ZONE 'UTC'\)/);
  assert.match(sql, /COALESCE\(NULLIF\(e\.class_id, ''\), s\.class_id\)/, "the billed enrollment's class comes first");
});

test("the raw query and the payment group-by keep the school, campus and currency scope", async () => {
  await fixture()();
  assert.match(sql, /WHERE i\.school_id = \? AND i\.campus_id = ANY\(\?::text\[\]\) AND i\.currency = \?/);
  assert.deepEqual(values.slice(1), ["school-a", ["campus-a"], "PKR"]);
  assert.deepEqual(groupByArgs.where, { schoolId: "school-a", campusId: { in: ["campus-a"] }, invoice: { currency: "PKR" } });
});
