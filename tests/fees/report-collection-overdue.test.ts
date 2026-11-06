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

function fixture() {
  const cls = { id: "class-a", name: "Year 1", section: "A" };
  const row = (status: string, total: number, paid: number, dueInDays: number) => ({
    enrollment: null, studentId: `pupil-${status}-${dueInDays}`, totalAmount: total, totalAmountPaid: paid, balanceDue: total - paid,
    status, dueDate: new Date(Date.now() + dueInDays * day), student: { class: cls },
  });
  const rows = [
    row("PENDING", 10000, 0, -5), // past due
    row("PARTIAL", 10000, 4000, -1), // past due, part paid
    row("PENDING", 10000, 0, 20), // not due yet
    row("PAID", 10000, 10000, -5),
    row("CANCELLED", 10000, 0, -5),
  ];
  const db = {
    campus: { findMany: async () => [{ id: "campus-a" }] },
    invoice: { findMany: async () => rows },
    payment: { findMany: async () => [{ paymentMethod: "CASH", amount: 14000 }] },
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
  const [row] = (await res.json()).data.byClass;
  assert.equal(row.totalDue, 40000, "cancelled is not a charge");
  assert.equal(row.totalPaid, 14000);
  assert.equal(row.totalOverdue, 16000, "10000 pending + 6000 part-paid, both past due; the invoice due in 20 days is not overdue");
});
