import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-1862: the profit report's by-source totals are aggregated in the database instead of loading
// every ledger entry in the range. Totals, buckets and tenant scope must match the old per-row result.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const routeCode = transformSync(readFileSync("src/app/api/accounts/profit/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;

type Entry = { id: string; schoolId: string; campusId: string; currency: string; kind: string; accountId: string; amount: number; date: Date; paymentId: string | null; payrollLineId: string | null; reversalOfId: string | null };
let seq = 0;
const entry = (kind: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${++seq}`, schoolId: "school-a", campusId: "campus-a", currency: "PKR", kind, accountId: "acc-1", amount,
  date: new Date("2026-03-01T00:00:00Z"), paymentId: null, payrollLineId: null, reversalOfId: null, ...extra,
});

// Applies the subset of Prisma `where` the route builds, including nested AND, so a lost scope shows up as wrong totals.
function matches(row: Entry, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where.AND) && !where.AND.every((part: any) => matches(row, part))) return false;
  if (where.campus?.schoolId !== undefined && row.schoolId !== where.campus.schoolId) return false;
  if (where.campus?.id !== undefined && row.campusId !== where.campus.id) return false;
  if (typeof where.currency === "string" && row.currency !== where.currency) return false;
  if (where.currency?.not !== undefined && row.currency === where.currency.not) return false;
  if (where.accountId !== undefined && row.accountId !== where.accountId) return false;
  if (where.date?.gte && row.date < where.date.gte) return false;
  if (where.date?.lte && row.date > where.date.lte) return false;
  for (const field of ["paymentId", "payrollLineId", "reversalOfId"] as const) {
    if (!(field in where)) continue;
    if (where[field] === null && row[field] !== null) return false;
    if (where[field]?.not === null && row[field] === null) return false;
  }
  return true;
}

function fixture(rows: Entry[], user = { role: "ACCOUNTANT", schoolId: "school-a" }) {
  const calls: any[] = [];
  const ledgerEntry = {
    groupBy: async (args: any) => {
      calls.push(args);
      const groups = new Map<string, Entry[]>();
      for (const row of rows.filter(r => matches(r, args.where))) {
        const key = args.by.map((field: keyof Entry) => row[field]).join("|");
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      return [...groups.values()].map(list => ({
        ...Object.fromEntries(args.by.map((field: keyof Entry) => [field, list[0][field]])),
        _sum: { amount: list.reduce((sum, r) => sum + r.amount, 0) }, _count: { _all: list.length },
      }));
    },
    findMany: async () => { throw new Error("the profit report must not load ledger rows"); },
  };
  const db = { ledgerEntry, chartOfAccount: { findMany: async () => [{ id: "acc-1", name: "Tuition", type: "INCOME", isActive: true }] } };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", routeCode)(mod, mod.exports, (id: string) => {
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/locale/store") return { getLocalePackage: async () => ({ currency: "PKR" }) };
    if (id === "@/lib/fees/ledger-service") return {
      // Mirrors ledgerWhere for the filters this route passes (currency, inclusive UTC dates, account, source).
      ledgerWhere: (scope: any, f: any) => {
        const where: any = { ...scope, currency: f.currency, date: { gte: new Date(`${f.from}T00:00:00Z`), lte: new Date(`${f.to}T23:59:59.999Z`) } };
        if (f.accountId) where.accountId = f.accountId;
        if (f.source === "FEE") Object.assign(where, { paymentId: { not: null }, reversalOfId: null });
        if (f.source === "CORRECTION") where.reversalOfId = { not: null };
        return where;
      },
      ledgerTotals: async (client: any, where: any) => {
        const groups = await client.ledgerEntry.groupBy({ by: ["kind"], where, _sum: { amount: true }, _count: { _all: true } });
        const pick = (kind: string) => groups.find((g: any) => g.kind === kind);
        const income = pick("INCOME")?._sum.amount ?? 0, expense = pick("EXPENSE")?._sum.amount ?? 0;
        return { income, expense, net: income - expense, incomeCount: pick("INCOME")?._count._all ?? 0, expenseCount: pick("EXPENSE")?._count._all ?? 0, count: 0 };
      },
    };
    if (id === "@/lib/api/scope") return {
      ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
      requireAuthUser: async () => user,
      assertModuleRead: async (u: { role: string }) => { if (u.role === "TEACHER") throw Object.assign(new Error("Forbidden"), { status: 403 }); },
      resolveCampusId: async (_u: unknown, campusId: string | null) => campusId,
      scopedCampusWhere: (u: { schoolId: string }, campusId?: string) => ({ campus: { schoolId: u.schoolId, ...(campusId ? { id: campusId } : {}) } }),
      errorResponse: (error: any) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    };
    return require(id);
  });
  const get = async (query: string) => {
    const res = await mod.exports.GET(new Request(`http://qa.test/api/accounts/profit?${query}`));
    return { status: res.status, body: await res.json() };
  };
  return { get, calls };
}

// The classification the route used when it loaded every row (pre-SKAI-1862).
function perRowBySource(rows: Entry[]) {
  const out: Record<string, { income: number; expense: number; count: number }> = {};
  for (const row of rows) {
    const source = row.reversalOfId ? "CORRECTION" : row.paymentId ? "FEE" : row.payrollLineId ? "PAYROLL" : "MANUAL";
    const bucket = out[source] ??= { income: 0, expense: 0, count: 0 };
    if (row.kind === "INCOME") bucket.income += row.amount; else bucket.expense += row.amount;
    bucket.count += 1;
  }
  return out;
}

const schoolA = () => [
  entry("INCOME", 5000, { paymentId: "p1" }), entry("INCOME", 7000, { paymentId: "p2" }),
  entry("EXPENSE", 30000, { payrollLineId: "pl1" }), entry("EXPENSE", 1200), entry("INCOME", 800),
  // A reversal of a fee payment counts as a correction, not a fee.
  entry("EXPENSE", -40000, { reversalOfId: "e1", paymentId: null, payrollLineId: "pl1" }),
];
const others = () => [
  entry("INCOME", 99999, { schoolId: "school-b", campusId: "campus-b", paymentId: "pb" }),
  entry("INCOME", 11111, { campusId: "campus-a2", paymentId: "pa2" }),
  entry("INCOME", 2222, { currency: "USD", paymentId: "pu" }),
  entry("INCOME", 3333, { date: new Date("2025-06-01T00:00:00Z") }),
];

test("by-source totals equal the per-row classification, in a stable order", async () => {
  const mine = schoolA();
  const f = fixture([...mine, ...others()]);
  const { status, body } = await f.get("campusId=campus-a&currency=PKR&from=2026-01-01&to=2026-12-31");
  assert.equal(status, 200);
  assert.deepEqual(body.data.bySource, perRowBySource(mine));
  assert.deepEqual(Object.keys(body.data.bySource), ["FEE", "PAYROLL", "MANUAL", "CORRECTION"]);
  assert.equal(body.data.income, 12800);
  assert.deepEqual(body.data.otherCurrencies, [{ currency: "USD", entries: 1 }]);
});

test("every ledger query keeps the school and campus scope; other schools and campuses never leak in", async () => {
  const f = fixture([...schoolA(), ...others()]);
  const campusA2 = await f.get("campusId=campus-a2&currency=PKR&from=2026-01-01&to=2026-12-31");
  assert.deepEqual(campusA2.body.data.bySource, { FEE: { income: 11111, expense: 0, count: 1 } });
  const whole = await f.get("currency=PKR&from=2026-01-01&to=2026-12-31");
  assert.equal(whole.body.data.bySource.FEE.income, 5000 + 7000 + 11111, "school-wide adds campus A2 but never school B");
  const schoolB = await fixture([...schoolA(), ...others()], { role: "ACCOUNTANT", schoolId: "school-b" }).get("currency=PKR&from=2026-01-01&to=2026-12-31");
  assert.deepEqual(schoolB.body.data.bySource, { FEE: { income: 99999, expense: 0, count: 1 } });
  for (const call of f.calls) {
    const scope = call.where.AND ? call.where.AND[0] : call.where;
    assert.equal(scope.campus.schoolId, "school-a");
  }
});

test("a source filter still narrows the buckets", async () => {
  const f = fixture(schoolA());
  const { body } = await f.get("campusId=campus-a&currency=PKR&from=2026-01-01&to=2026-12-31&source=FEE");
  assert.deepEqual(body.data.bySource, { FEE: { income: 12000, expense: 0, count: 2 } });
});

test("query count and result size do not grow with the number of entries", async () => {
  const many = Array.from({ length: 2000 }, (_, i) => entry(i % 2 ? "INCOME" : "EXPENSE", 10, { paymentId: i % 3 ? `p${i}` : null }));
  const small = fixture(schoolA()), large = fixture(many);
  await small.get("campusId=campus-a&currency=PKR&from=2026-01-01&to=2026-12-31");
  const { body } = await large.get("campusId=campus-a&currency=PKR&from=2026-01-01&to=2026-12-31");
  assert.equal(large.calls.length, small.calls.length, "a fixed number of aggregate queries");
  assert.deepEqual(body.data.bySource, perRowBySource(many));
});

test("a role without accounts access is denied before any ledger query", async () => {
  const f = fixture(schoolA(), { role: "TEACHER", schoolId: "school-a" });
  const { status } = await f.get("currency=PKR&from=2026-01-01&to=2026-12-31");
  assert.equal(status, 403);
  assert.equal(f.calls.length, 0);
});

test("the profit panel drops stale responses and does not refetch the currency the server echoed", () => {
  const ui = readFileSync("src/components/fees/AccountsTab.tsx", "utf8");
  const panel = ui.slice(ui.indexOf("function ProfitPanel"), ui.indexOf("usePanelCommand(command, { export:", ui.indexOf("function ProfitPanel")));
  assert.match(panel, /latestRequest\.current\?\.abort\(\);/);
  assert.match(panel, /signal: controller\.signal/);
  assert.match(panel, /if \(controller\.signal\.aborted\) return;/);
  assert.match(panel, /if \(latestRequest\.current === controller\) setLoading\(false\);/);
  // Skipping the refetch also cancels a newer request in flight, so returning to the shown params cannot be overwritten.
  assert.match(panel, /if \(currency && loadedKey\.current === reportKey\(currency\)\) \{ latestRequest\.current\?\.abort\(\); return; \}/);
});
