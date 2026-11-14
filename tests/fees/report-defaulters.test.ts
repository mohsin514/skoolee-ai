import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const compile = (path: string) => transformSync(readFileSync(path, "utf8"), { loader: "ts", format: "cjs" }).code;
const currencyCode = compile("src/app/api/fees/reports/invoice-currency.ts");
const routeCode = compile("src/app/api/fees/reports/defaulters/route.ts");
const queryCode = compile("src/lib/lists/query.ts");

const DAY = 86_400_000;
type Row = { id: string; schoolId: string; studentId: string; currency: string; campusId: string; totalAmount: number; totalAmountPaid: number; balanceDue: number; dueDate: Date; status: string; enrollment: { rollNo: string; className: string } | null; student: any };
const pupil = (name: string) => ({ fullName: name, rollNo: `R-${name}`, guardianName: "Guardian", guardianPhone: "000", guardianEmail: null, class: { name: "Year 1", section: "A" } });
const invoice = (id: string, studentId: string, balanceDue: number, daysAgo: number, extra: Partial<Row> = {}): Row => ({
  id, schoolId: "school-a", studentId, currency: "PKR", campusId: "campus-a", totalAmount: 10000, totalAmountPaid: 10000 - balanceDue,
  balanceDue, dueDate: new Date(Date.now() - daysAgo * DAY), status: "PENDING", enrollment: null, student: pupil(studentId), ...extra,
});

// Applies the subset of Prisma `where` the route uses, so a lost tenant or overdue filter shows up as wrong rows.
function matches(r: Row, w: any) {
  if (w.schoolId !== undefined && r.schoolId !== w.schoolId) return false;
  if (w.campus?.schoolId !== undefined && r.schoolId !== w.campus.schoolId) return false;
  if (w.currency !== undefined && r.currency !== w.currency) return false;
  if (w.campusId?.in && !w.campusId.in.includes(r.campusId)) return false;
  if (w.studentId?.in && !w.studentId.in.includes(r.studentId)) return false;
  if (w.status?.not && r.status === w.status.not) return false;
  if (w.status?.in && !w.status.in.includes(r.status)) return false;
  if (w.balanceDue?.gt !== undefined && !(r.balanceDue > w.balanceDue.gt)) return false;
  if (w.dueDate?.lt && !(r.dueDate < w.dueDate.lt)) return false;
  if (w.dueDate?.lte && !(r.dueDate <= w.dueDate.lte)) return false;
  return true;
}

function fixture(rows: Row[], user: { role: string; schoolId: string } = { role: "ACCOUNTANT", schoolId: "school-a" }) {
  const calls: any[] = [];
  const db = {
    // The paged total's COUNT(DISTINCT student_id): applies the SQL's school, currency, campus and due-date filters.
    $queryRaw: async (sql: { sql: string; values: any[] }) => {
      const [schoolId, currency, ...rest] = sql.values;
      const cutoff = new Date(`${rest.pop()}Z`);
      calls.push({ op: "count", schoolId, currency, campusIds: rest, sql: sql.sql });
      const inclusive = /due_date <= /.test(sql.sql);
      const hit = rows.filter((r) => r.schoolId === schoolId && r.currency === currency && rest.includes(r.campusId) && r.status !== "CANCELLED"
        && r.balanceDue > 0 && (inclusive ? r.dueDate <= cutoff : r.dueDate < cutoff));
      return [{ n: new Set(hit.map((r) => r.studentId)).size }];
    },
    campus: { findMany: async (args: any) => [{ id: "campus-a", schoolId: "school-a" }, { id: "campus-b", schoolId: "school-b" }].filter((c) => c.schoolId === args.where.schoolId) },
    invoice: {
      groupBy: async (args: any) => {
        calls.push({ op: "groupBy", ...args });
        const hit = rows.filter((r) => matches(r, args.where));
        const key = args.by[0] as "currency" | "studentId";
        const groups = new Map<string, Row[]>();
        for (const r of hit) groups.set(r[key], [...(groups.get(r[key]) ?? []), r]);
        const out = [...groups].map(([k, list]) => ({
          [key]: k, _count: { _all: list.length },
          _sum: { totalAmount: list.reduce((s, r) => s + r.totalAmount, 0), totalAmountPaid: list.reduce((s, r) => s + r.totalAmountPaid, 0), balanceDue: list.reduce((s, r) => s + r.balanceDue, 0) },
          _min: { dueDate: new Date(Math.min(...list.map((r) => r.dueDate.getTime()))) },
        }));
        if (key === "studentId" && args.orderBy) out.sort((a: any, b: any) => b._sum.balanceDue - a._sum.balanceDue || a._min.dueDate - b._min.dueDate || a.studentId.localeCompare(b.studentId));
        const skip = args.skip ?? 0;
        return out.slice(skip, args.take === undefined ? undefined : skip + args.take);
      },
      findMany: async (args: any) => {
        calls.push({ op: "findMany", ...args });
        const seen = new Set<string>();
        return rows.filter((r) => matches(r, args.where)).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
          .filter((r) => (seen.has(r.studentId) ? false : (seen.add(r.studentId), true)));
      },
    },
  };
  const currencies = { exports: {} as any };
  new Function("module", "exports", "require", currencyCode)(currencies, currencies.exports, () => ({ prisma: db }));
  const lists = { exports: {} as any };
  new Function("module", "exports", "require", queryCode)(lists, lists.exports, require);
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", routeCode)(mod, mod.exports, (id: string) => {
    if (id === "../invoice-currency") return currencies.exports;
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/lists/query") return lists.exports;
    if (id === "@/lib/locale/store") return { getLocalePackage: async () => ({ currency: "USD" }) };
    if (id === "@/lib/locale/package") return { CURRENCIES: ["USD", "PKR"] };
    if (id === "@/lib/api/scope") return {
      requireAuthUser: async () => user,
      assertFeesRead: async (u: { role: string }) => { if (u.role === "TEACHER") throw Object.assign(new Error("Forbidden"), { status: 403 }); },
      resolveCampusId: async (u: { schoolId: string }) => (u.schoolId === "school-a" ? "campus-a" : "campus-b"),
      errorResponse: (error: any) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    };
    return require(id);
  });
  return { get: (query = "") => mod.exports.GET(new Request(`http://qa.test/api/fees/reports/defaulters${query}`)), calls };
}

test("USD locale with PKR invoices reports pending AND partly paid debts, excluding cancellations", async () => {
  const f = fixture([
    invoice("1", "pupil-a", 10000, 10), invoice("2", "pupil-a", 6000, 10, { status: "PARTIAL" }), invoice("3", "pupil-a", 10000, 10, { status: "CANCELLED" }),
  ]);
  const res = await f.get();
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.total, 1);
  assert.equal(body.data[0].currency, "PKR");
  assert.equal(body.data[0].overdueInvoices, 2);
  assert.equal(body.data[0].totalOverdue, 16000);
  assert.equal(body.data[0].daysOverdue, 10);
  assert.equal(body.pagination, undefined, "no page params keeps the full, unpaged list");
  const scope = f.calls.find((c) => c.op === "groupBy" && c.by[0] === "currency").where;
  assert.deepEqual(scope.campus, { schoolId: "school-a" });
  assert.deepEqual(scope.campusId, { in: ["campus-a"] });
  for (const call of f.calls.filter((c) => c.by?.[0] !== "currency" && c.op !== "count")) assert.equal(call.where.schoolId, "school-a", "every defaulter query carries the school");
});

test("explicit currency stays authoritative; malformed overdue-day and currency filters are rejected", async () => {
  const f = fixture([invoice("1", "pupil-a", 10000, 10)]);
  assert.deepEqual((await (await f.get("?currency=USD")).json()).data, []);
  for (const query of ["?currency=INVALID", "?minDays=abc", "?minDays=-1", "?minDays=1.5"]) {
    assert.equal((await f.get(query)).status, 400, query);
  }
});

const ledger = () => [
  invoice("a1", "pupil-a", 3000, 40, { enrollment: { rollNo: "E-7", className: "Year 2" } }), invoice("a2", "pupil-a", 3000, 5),
  invoice("b1", "pupil-b", 9000, 20), invoice("c1", "pupil-c", 1000, 3), invoice("d1", "pupil-d", 500, 0.5),
  // Another school's debt on another campus never reaches school A's report.
  invoice("x1", "pupil-x", 99999, 60, { schoolId: "school-b", campusId: "campus-b" }),
];

test("pages are sorted by overdue amount and total counts every defaulting student of this school only", async () => {
  const f = fixture(ledger());
  const first = await (await f.get("?currency=PKR&page=1&limit=2")).json();
  assert.deepEqual(first.data.map((d: any) => d.studentId), ["pupil-b", "pupil-a"]);
  assert.equal(first.total, 3, "pupil-d is not a whole day overdue under the default minDays=1");
  assert.deepEqual(first.pagination, { page: 1, limit: 2, total: 3, pages: 2 });
  const second = await (await f.get("?currency=PKR&page=2&limit=2")).json();
  assert.deepEqual(second.data.map((d: any) => d.studentId), ["pupil-c"]);
  const counts = f.calls.filter((c) => c.op === "count");
  assert.ok(counts.length >= 2 && counts.every((c) => c.schoolId === "school-a" && c.campusIds.join() === "campus-a"), "the SQL count carries the school and campus");
  assert.equal(f.calls.filter((c) => c.op === "groupBy" && c.by[0] === "studentId" && c.orderBy === undefined).length, 0, "no per-student list is read just to count it");
  const before = f.calls.length;
  const beyond = await (await f.get("?currency=PKR&page=9&limit=2")).json();
  assert.equal(beyond.pagination.page, 2, "a stale page clamps to the last page");
  assert.deepEqual(beyond.data.map((d: any) => d.studentId), ["pupil-c"], "the clamped page re-reads the last page's rows");
  assert.deepEqual(f.calls.slice(before).filter((c) => c.op === "groupBy" && c.by[0] === "studentId").map((c) => c.skip), [16, 2]);
  const all = await (await f.get("?currency=PKR")).json();
  assert.deepEqual(all.data.map((d: any) => d.studentId), ["pupil-b", "pupil-a", "pupil-c"]);
  const a = all.data[1];
  assert.equal(a.totalOverdue, 6000);
  assert.equal(a.daysOverdue, 40);
  assert.equal(a.rollNo, "E-7", "roll number comes from the earliest overdue invoice's enrollment snapshot");
  assert.equal(a.className, "Year 2");
  assert.equal(a.section, null);
  const lookup = f.calls.filter((c) => c.op === "findMany").at(-1);
  assert.deepEqual(lookup.where.studentId.in.sort(), ["pupil-a", "pupil-b", "pupil-c"]);
  const pageLookup = f.calls.filter((c) => c.op === "findMany")[0];
  assert.deepEqual(pageLookup.where.studentId.in, ["pupil-b", "pupil-a"], "student details load only for the page");
});

test("minDays replaces the per-invoice day filter in SQL", async () => {
  const f = fixture(ledger());
  const strict = await (await f.get("?currency=PKR&minDays=10")).json();
  assert.deepEqual(strict.data.map((d: any) => [d.studentId, d.overdueInvoices]), [["pupil-b", 1], ["pupil-a", 1]]);
  const any = await (await f.get("?currency=PKR&minDays=0")).json();
  assert.equal(any.total, 4);
});

test("the other school sees only its own defaulters; a role without fee access is denied", async () => {
  const other = await (await fixture(ledger(), { role: "ACCOUNTANT", schoolId: "school-b" }).get("?currency=PKR&page=1&limit=10")).json();
  assert.deepEqual(other.data.map((d: any) => d.studentId), ["pupil-x"]);
  assert.equal(other.total, 1);
  const denied = fixture(ledger(), { role: "TEACHER", schoolId: "school-a" });
  assert.equal((await denied.get()).status, 403);
  assert.equal(denied.calls.length, 0);
});
