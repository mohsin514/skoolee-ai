import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const compile = (path: string) => transformSync(readFileSync(path, "utf8"), { loader: "ts", format: "cjs" }).code;
const currencyCode = compile("src/app/api/fees/reports/invoice-currency.ts");
const routeCode = compile("src/app/api/fees/reports/defaulters/route.ts");

function fixture() {
  let where: any;
  let currencyScope: any;
  const rows = ["PENDING", "PARTIAL", "CANCELLED"].map((status, index) => ({
    id: String(index), studentId: "pupil-a", invoiceNumber: String(index), currency: "PKR", campusId: "campus-a",
    totalAmount: 10000, totalAmountPaid: status === "PARTIAL" ? 4000 : 0, balanceDue: status === "PARTIAL" ? 6000 : 10000,
    dueDate: new Date(Date.now() - 10 * 86_400_000), status, enrollment: null,
    student: { fullName: "Synthetic Pupil", rollNo: "R-1", class: { name: "Year 1", section: "A" } },
  }));
  const db = {
    campus: { findMany: async () => [{ id: "campus-a" }] },
    invoice: {
      groupBy: async (args: any) => { currencyScope = args.where; return [{ currency: "PKR", _count: { _all: 3 } }]; },
      findMany: async (args: any) => {
        where = args.where;
        return rows.filter((r) => r.currency === where.currency && where.campusId.in.includes(r.campusId)
          && (where.status.in ? where.status.in.includes(r.status) : r.status !== where.status.not));
      },
    },
  };
  const currencies = { exports: {} as any };
  new Function("module", "exports", "require", currencyCode)(currencies, currencies.exports, () => ({ prisma: db }));
  const module = { exports: {} as any };
  new Function("module", "exports", "require", routeCode)(module, module.exports, (id: string) => {
    if (id === "../invoice-currency") return currencies.exports;
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/locale/store") return { getLocalePackage: async () => ({ currency: "USD" }) };
    if (id === "@/lib/locale/package") return { CURRENCIES: ["USD", "PKR"] };
    if (id === "@/lib/api/scope") return {
      requireAuthUser: async () => ({ role: "ACCOUNTANT", schoolId: "school-a" }),
      assertFeesRead: async () => {}, resolveCampusId: async () => "campus-a",
      errorResponse: (error: unknown) => { throw error; },
    };
    return require(id);
  });
  return { get: (query = "") => module.exports.GET(new Request(`http://qa.test/api/fees/reports/defaulters${query}`)), query: () => where, scope: () => currencyScope };
}

test("USD locale with PKR invoices reports pending AND partly paid debts, excluding cancellations", async () => {
  const f = fixture();
  const res = await f.get();
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.total, 1);
  assert.equal(body.data[0].currency, "PKR");
  assert.equal(body.data[0].overdueInvoices, 2);
  assert.equal(body.data[0].totalOverdue, 16000);
  assert.deepEqual(f.scope().campus, { schoolId: "school-a" });
  assert.deepEqual(f.scope().campusId, { in: ["campus-a"] });
  assert.ok(f.query().dueDate.lt instanceof Date);
});

test("explicit currency stays authoritative; malformed overdue-day and currency filters are rejected", async () => {
  const f = fixture();
  assert.deepEqual((await (await f.get("?currency=USD")).json()).data, []);
  for (const query of ["?currency=INVALID", "?minDays=abc", "?minDays=-1", "?minDays=1.5"]) {
    assert.equal((await f.get(query)).status, 400, query);
  }
});
