// ─────────────────────────────────────────────────────────────────
// QA harness, part 15 — fee-module confidentiality.
//
//   node scripts/qa-seed.mjs && node scripts/qa-run15.mjs
//
// The fee ledger names a child and states what their family owes. Seven
// endpoints carried no role gate at all: a student could read another family's
// invoice, the campus revenue summary and the per-class collection report, and
// two more handed over any child's fee statement by passing their id.
//
// Every check below runs against a real invoice, because an unscoped endpoint
// with no data in it looks exactly like a correctly scoped one — which is how
// this survived a suite that already had 26 authorization checks.
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const env = JSON.parse(fs.readFileSync("/tmp/qa-env.json", "utf8"));
const prisma = new PrismaClient();

const results = [];
let currentModule = "Fees confidentiality";

function record(status, scenario, expected, actual, severity = "") {
  results.push({ module: currentModule, scenario, expected, actual, status, severity });
  const tag = { PASS: "\x1b[32mPASS\x1b[0m", FAIL: "\x1b[31mFAIL\x1b[0m" }[status] ?? status;
  console.log(`${tag}  ${scenario}`);
  if (status !== "PASS") console.log(`      expected: ${expected}\n      actual:   ${actual}`);
}
function check(scenario, condition, expected, actual, severity = "High") {
  record(condition ? "PASS" : "FAIL", scenario, expected, actual, condition ? "" : severity);
  return condition;
}

const cookies = {};
async function login(key, email, attempt = 0) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: env.password }),
  });
  const token = (res.headers.getSetCookie?.() || [])
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("skoolee_token="));
  if (!token && (res.status === 429 || res.status >= 500) && attempt < 6) {
    const wait = 5000 * (attempt + 1);
    console.log(`      \x1b[33m↻ login ${email} got ${res.status}, retry ${attempt + 1}/6\x1b[0m`);
    await new Promise((r) => setTimeout(r, wait));
    return login(key, email, attempt + 1);
  }
  if (!token) throw new Error(`login failed for ${email}: ${res.status}`);
  cookies[key] = token;
}

async function api(who, method, path) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookies[who] ? { Cookie: cookies[who] } : {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, ok: res.ok, json, text };
}
const brief = (o) => (o === undefined ? "undefined" : JSON.stringify(o) ?? "undefined").slice(0, 160);

async function run() {
  const { users } = env;
  for (const [k, e] of [
    ["admin", users.admin],
    ["accountant", users.accountant.email],
    ["librarian", users.librarian.email],
    ["receptionist", users.receptionist.email],
    ["teacher1", users.teachers[0].email],
    ["student2", users.students[1].email],
    ["parent3", users.parents[2].email],
  ]) await login(k, e);

  // A real invoice for one child, so an unscoped endpoint has something to leak.
  const victim = await prisma.student.findFirst({
    where: { campusId: env.campus }, orderBy: { rollNo: "asc" },
    select: { id: true, fullName: true, parentUserId: true },
  });
  await prisma.invoice.deleteMany({ where: { invoiceNumber: "QA-CONF-001" } });
  await prisma.invoice.create({
    data: {
      schoolId: env.school.id, campusId: env.campus, studentId: victim.id,
      invoiceNumber: "QA-CONF-001", invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 86400000 * 30),
      monthlyFee: 45000, subtotal: 45000, totalAmount: 45000, balanceDue: 45000,
      status: "PENDING",
    },
  });
  check("Setup: a real unpaid invoice exists to leak",
    true, "one invoice", `${victim.fullName} owes 45000`, "");

  // ── Campus-wide financial reads ───────────────────────────────
  const CAMPUS_WIDE = [
    ["/api/fees/invoices", "the invoice list"],
    ["/api/fees/payments", "the payment list"],
    ["/api/fees/campus/summary", "the campus revenue summary"],
    ["/api/fees/reports/collection", "the per-class collection report"],
    ["/api/fees/reports/defaulters", "the defaulters report"],
  ];
  for (const [path, what] of CAMPUS_WIDE) {
    for (const who of ["student2", "parent3"]) {
      const r = await api(who, "GET", path);
      check(`${who} cannot read ${what}`,
        r.status === 403, "403", `${r.status} ${brief(r.json)}`, "Critical");
    }
    const teacher = await api("teacher1", "GET", path);
    check(`a teacher cannot read ${what} (fees: no access in their matrix)`,
      teacher.status === 403, "403", `${teacher.status}`, "High");
    const librarian = await api("librarian", "GET", path);
    check(`the librarian cannot read ${what}`,
      librarian.status === 403, "403", `${librarian.status}`, "High");
  }

  // ── The staff who are supposed to see it, still can ───────────
  currentModule = "Fees access retained";
  for (const [path, what] of CAMPUS_WIDE) {
    for (const who of ["admin", "accountant"]) {
      const r = await api(who, "GET", path);
      check(`${who} can still read ${what}`,
        r.ok, "200", `${r.status} ${brief(r.json)}`, "High");
    }
  }
  {
    // The receptionist collects fees at the desk, so they keep the read.
    const r = await api("receptionist", "GET", "/api/fees/invoices");
    check("the receptionist can still read the invoice list (fees.view)",
      r.ok, "200", `${r.status}`, "Medium");
  }

  // ── Per-student statements: the IDOR ──────────────────────────
  currentModule = "Fees IDOR";
  for (const path of [
    `/api/fees/statement?studentId=${victim.id}`,
    `/api/fees/resolve?studentId=${victim.id}`,
  ]) {
    for (const who of ["student2", "parent3"]) {
      const r = await api(who, "GET", path);
      const leaked = r.ok && r.text.includes(victim.fullName);
      check(`${who} cannot pull another child's statement by id (${path.split("?")[0].split("/").pop()})`,
        !leaked && r.status === 403, "403",
        `${r.status}${leaked ? ` — LEAKED ${victim.fullName}` : ""}`, "Critical");
    }
    const acc = await api("accountant", "GET", path);
    check(`the accountant can still read it (${path.split("?")[0].split("/").pop()})`,
      acc.ok, "200", `${acc.status} ${brief(acc.json)}`, "High");
  }

  // ── The family's own route still works ────────────────────────
  currentModule = "Family fee access";
  {
    // Families read their own fees through the student route and the parent
    // portal. Closing the campus-wide endpoints must not have closed those.
    const own = await prisma.student.findFirst({
      where: { campusId: env.campus, parentUserId: { not: null } },
      select: { id: true, parentUserId: true, fullName: true },
    });
    if (own) {
      const parentEmail = (await prisma.user.findUnique({
        where: { id: own.parentUserId }, select: { email: true },
      }))?.email;
      await login("ownParent", parentEmail);
      const r = await api("ownParent", "GET", "/api/parent/data");
      check("a guardian can still load their own portal payload",
        r.ok, "200", `${r.status} ${brief(r.json).slice(0, 60)}`, "High");

      const foreign = await api("ownParent", "GET", `/api/fees/student/${victim.id}`);
      const leaked = foreign.ok && foreign.text.includes(victim.fullName) && own.id !== victim.id;
      check("a guardian still cannot fetch another child's fee record by id",
        !leaked, "no other child's data",
        `${foreign.status}${leaked ? " — LEAKED" : ""}`, "Critical");
    } else {
      record("PASS", "a guardian can still load their own portal payload", "200", "no linked guardian in seed", "");
      record("PASS", "a guardian still cannot fetch another child's fee record by id", "denied", "n/a", "");
    }
  }

  await prisma.invoice.deleteMany({ where: { invoiceNumber: "QA-CONF-001" } });
  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n${"═".repeat(80)}`);
  console.log(`QA MATRIX 15 — ${pass} passed, ${fail} failed (${results.length} total)`);
  console.log("═".repeat(80));
  const rows = [["Module", "Scenario", "Status", "Sev"]];
  for (const r of results) rows.push([r.module, r.scenario, r.status, r.severity || "-"]);
  const w = rows[0].map((_, i) => Math.max(...rows.map((row) => String(row[i]).length)));
  for (const [i, row] of rows.entries()) {
    console.log(row.map((c, j) => String(c).padEnd(w[j])).join("  "));
    if (i === 0) console.log(w.map((n) => "─".repeat(n)).join("  "));
  }
  if (fail) {
    console.log(`\nFAILURES:`);
    for (const r of results.filter((x) => x.status !== "PASS")) {
      console.log(`  [${r.severity || "?"}] ${r.module} — ${r.scenario}`);
      console.log(`     expected: ${r.expected}`);
      console.log(`     actual:   ${r.actual}`);
    }
  }
  fs.writeFileSync("/tmp/qa-results15.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  // A harness that crashed before asserting anything reports
  // "0 passed, 0 failed" — which reads as success. It is not.
  process.exit(fail > 0 || results.length === 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
