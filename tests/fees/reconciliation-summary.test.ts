import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// SKAI-1865: the reconciliation panel used to receive every matched and unmatched row of 30 statements and
// render every unmatched row. It now asks for a summary (counts, currency, the first 20 unallocated rows) and
// loads one statement in full only on request. The default response keeps its old shape; the conservation
// report is still computed from every row; every read stays inside the caller's school and campus.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const routeCode = transformSync(readFileSync("src/app/api/fees/reconciliations/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;
const bankReconciliation = require(path.resolve("src/lib/fees/bank-reconciliation.ts"));

type Who = { role: string; schoolId: string; campusId: string | null };
type Rec = { id: string; schoolId: string; campusId: string; status: string; bankAccount: string | null; statementPeriodFrom: Date | null; statementPeriodTo: Date | null; createdAt: Date; reconciliationDetailsJson: unknown; unmatchedJson: unknown };

const line = (n: number, extra: Record<string, unknown> = {}) => ({ rowNumber: n, date: "2026-10-09", amountMinor: 1000, description: `Line ${n}`, currency: "PKR", ...extra });
const statement = (id: string, schoolId: string, campusId: string, matched: number, unmatched: number): Rec => ({
  id, schoolId, campusId, status: "pending", bankAccount: null, statementPeriodFrom: new Date("2026-10-01Z"), statementPeriodTo: new Date("2026-10-31Z"), createdAt: new Date("2026-11-01Z"),
  reconciliationDetailsJson: Array.from({ length: matched }, (_, i) => line(i + 1, i === 0 ? { manualMatch: { reason: "Confirmed by phone" } } : {})),
  unmatchedJson: Array.from({ length: unmatched }, (_, i) => line(matched + i + 1)),
});
const store: Rec[] = [
  statement("rec-a1-big", "school-a", "campus-a1", 3, 250),
  statement("rec-a1-small", "school-a", "campus-a1", 1, 2),
  statement("rec-a2", "school-a", "campus-a2", 1, 1),
  statement("rec-b1", "school-b", "campus-b1", 1, 1),
];

function fixture(who: Who) {
  const calls = { wheres: [] as Record<string, unknown>[] };
  const db = {
    bankReconciliation: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        calls.wheres.push(where);
        return store.filter((rec) => Object.entries(where).every(([key, value]) => rec[key as keyof Rec] === value));
      },
    },
    auditLog: { findMany: async () => [] },
    bankAccount: { findMany: async () => [] },
  };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", routeCode)(mod, mod.exports, (id: string) => {
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/fees/payment") return { recordPayment: async () => { throw new Error("not used"); } };
    if (id === "@/lib/fees/bank-reconciliation") return bankReconciliation;
    if (id === "@/lib/api/validate") return { parseBody: async () => ({}) };
    if (id === "@/lib/validators/route-bodies") return { jsonObjectBody: {} };
    if (id === "@/lib/validators/fields") return { isRealDate: () => true };
    if (id === "@/lib/api/scope") return {
      ApiError: class extends Error {},
      requireAuthUser: async () => ({ userId: "user-1", ...who }),
      assertStaffRole: (user: Who) => { if (user.role === "PARENT") throw Object.assign(new Error("Forbidden"), { status: 403 }); },
      assertPermission: async () => undefined,
      resolveCampusId: async (user: Who, requested: string | null) => {
        if (requested && user.campusId && requested !== user.campusId) throw Object.assign(new Error("Forbidden"), { status: 403 });
        return requested ?? user.campusId;
      },
      errorResponse: (error: { status?: number }) => Response.json({ success: false, error: "denied" }, { status: error.status ?? 500 }),
    };
    return require(id);
  });
  const get = async (query = "") => {
    const url = new URL(`http://qa.test/api/fees/reconciliations${query}`);
    return mod.exports.GET(Object.assign(new Request(url), { nextUrl: url }));
  };
  return { calls, get };
}
const accountant = { role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" };

test("the summary carries counts, currency and at most 20 unallocated rows; the report still covers every row", async () => {
  const res = await fixture(accountant).get("?summary=1");
  assert.equal(res.status, 200);
  const big = (await res.json()).data.find((rec: { id: string }) => rec.id === "rec-a1-big");
  assert.equal(big.matched, undefined, "matched rows are not sent with the summary");
  assert.deepEqual([big.matchedCount, big.manualMatchCount, big.currency, big.unmatchedCount, big.unmatched.length], [3, 1, "PKR", 250, 20]);
  assert.deepEqual(big.unmatched.map((row: { rowNumber: number }) => row.rowNumber), Array.from({ length: 20 }, (_, i) => i + 4), "the first rows in statement order");
  assert.deepEqual([big.report.received, big.report.allocated, big.report.unallocated, big.report.balanced], [253000, 3000, 250000, true]);
});

test("the default response keeps every matched and unmatched row", async () => {
  const data = (await (await fixture(accountant).get()).json()).data;
  const big = data.find((rec: { id: string }) => rec.id === "rec-a1-big");
  assert.deepEqual([big.matched.length, big.unmatched.length, big.matchedCount], [3, 250, undefined]);
  assert.equal(big.matched[0].manualMatch.reason, "Confirmed by phone");
});

test("?id= returns one statement in full, only inside the caller's school and campus (two schools, two campuses)", async () => {
  const a1 = fixture(accountant);
  const one = (await (await a1.get("?id=rec-a1-big")).json()).data;
  assert.deepEqual([one.length, one[0].unmatched.length], [1, 250]);
  assert.deepEqual(a1.calls.wheres.at(-1), { schoolId: "school-a", campusId: "campus-a1", id: "rec-a1-big" });
  assert.deepEqual((await (await a1.get("?id=rec-a2")).json()).data, [], "another campus's statement is not found");
  assert.deepEqual((await (await a1.get("?id=rec-b1")).json()).data, [], "another school's statement is not found");
  const b = fixture({ role: "ACCOUNTANT", schoolId: "school-b", campusId: "campus-b1" });
  assert.deepEqual((await (await b.get("?id=rec-a1-big")).json()).data, []);
  assert.deepEqual(b.calls.wheres.at(-1), { schoolId: "school-b", campusId: "campus-b1", id: "rec-a1-big" });
});

test("another campus and a family role are denied before any read", async () => {
  const other = fixture(accountant);
  assert.equal((await other.get("?campusId=campus-a2&summary=1")).status, 403);
  const parent = fixture({ role: "PARENT", schoolId: "school-a", campusId: "campus-a1" });
  assert.equal((await parent.get("?id=rec-a1-big")).status, 403);
  assert.equal(other.calls.wheres.length + parent.calls.wheres.length, 0);
});

test("the panel asks for the summary; the ledger loads its pick lists once per campus, not per page or filter", () => {
  const panel = readFileSync("src/components/fees/reconciliations-panel.tsx", "utf8");
  assert.match(panel, /\/api\/fees\/reconciliations\?summary=1/);
  assert.match(panel, /\/api\/fees\/reconciliations\?id=/);
  const tab = readFileSync("src/components/fees/AccountsTab.tsx", "utf8");
  const load = tab.slice(tab.indexOf("const load = useCallback(async () => {\n    const version = ++requestVersion"), tab.indexOf("}, [buildParams, pickedCurrency, page, tr]);"));
  assert.ok(load.length > 0 && !/accounts\/(chart|bank-accounts)/.test(load), "the ledger load fetches only the ledger");
  assert.match(tab, /fetchList\("chart"\), fetchList\("bank-accounts"\)\][\s\S]*?\}, \[campusId\]\);/, "pick lists reload only when the campus changes");
  assert.match(tab, /DATE_FILTER_DEBOUNCE_MS = 300/);
  assert.match(tab, /\}, \[buildParams, pickedCurrency, page, tr\]\);/, "the reported currency is not a load dependency, so it never triggers a second load");
  assert.match(tab, /buildParams\(pickedCurrency \|\| ledgerCurrency\.current\)/, "a currency the reader picks still filters the ledger");
  assert.match(tab, /setPickedCurrency\(e\.target\.value\)/, "picking a currency reloads the ledger");
});
