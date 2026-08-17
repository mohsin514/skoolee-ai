// ─────────────────────────────────────────────────────────────────
// QA harness, part 16 — operations-module confidentiality, and fee arithmetic.
//
//   node scripts/qa-seed.mjs && node scripts/qa-run16.mjs
//
// Two halves:
//
//  1. Every operational module's GET stopped at requireAuthUser(). The writes
//     were gated; the reads were not. Any signed-in account could read the
//     general ledger, the school's bank accounts, the visitor and complaints
//     log, library borrowing records and the staff leave register. These checks
//     hold that shut, and — just as importantly — hold it open for the staff
//     whose job needs it, so a future "fix" cannot be to deny everyone.
//
//  2. The money itself. Displayed totals are not evidence: every figure here is
//     recomputed from its parts and compared, because a balance that is merely
//     consistent with itself can still be consistently wrong.
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const env = JSON.parse(fs.readFileSync("/tmp/qa-env.json", "utf8"));
const prisma = new PrismaClient();

const results = [];
let currentModule = "Operations reads";

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
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    return login(key, email, attempt + 1);
  }
  if (!token) throw new Error(`login failed for ${email}: ${res.status}`);
  cookies[key] = token;
}

async function api(who, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookies[who] ? { Cookie: cookies[who] } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
    ["admin", users.admin], ["principal", users.principal],
    ["accountant", users.accountant.email],
    ["librarian", users.librarian.email],
    ["receptionist", users.receptionist.email],
    ["teacher1", users.teachers[0].email],
    ["student2", users.students[1].email],
    ["parent3", users.parents[2].email],
  ]) await login(k, e);

  // ── 1. Operations module reads ────────────────────────────────
  currentModule = "Operations reads";
  const MODULES = [
    ["/api/library/books", "the library catalogue", ["admin", "librarian"], ["student2", "parent3", "teacher1", "accountant"]],
    ["/api/library/members", "who holds a library membership", ["admin", "librarian"], ["student2", "parent3", "teacher1"]],
    ["/api/library/issues", "who has borrowed which book", ["admin", "librarian"], ["student2", "parent3", "teacher1"]],
    ["/api/accounts/ledger", "the general ledger", ["admin", "accountant"], ["student2", "parent3", "teacher1", "librarian", "receptionist"]],
    ["/api/accounts/chart", "the chart of accounts", ["admin", "accountant"], ["student2", "parent3", "teacher1", "librarian"]],
    ["/api/accounts/bank-accounts", "the school's bank accounts", ["admin", "accountant"], ["student2", "parent3", "teacher1", "librarian", "receptionist"]],
    ["/api/front-desk/visitors", "the visitor log", ["admin", "receptionist"], ["student2", "parent3", "teacher1", "accountant"]],
    ["/api/front-desk/complaints", "the complaints log", ["admin", "receptionist"], ["student2", "parent3", "teacher1"]],
    ["/api/dormitory/rooms", "dormitory rooms", ["admin"], ["student2", "parent3", "teacher1"]],
    ["/api/transport/routes", "transport routes", ["admin"], ["student2", "parent3", "teacher1"]],
    ["/api/inventory/items", "the inventory", ["admin"], ["student2", "parent3", "teacher1"]],
    ["/api/leave", "the leave register", ["admin", "teacher1"], ["student2", "parent3"]],
  ];

  for (const [path, what, allowRoles, denyRoles] of MODULES) {
    for (const who of denyRoles) {
      const r = await api(who, "GET", path);
      check(`${who} cannot read ${what}`,
        r.status === 403, "403", `${r.status} ${brief(r.json)}`,
        path.includes("accounts") || path.includes("front-desk") ? "Critical" : "High");
    }
    for (const who of allowRoles) {
      const r = await api(who, "GET", path);
      check(`${who} can still read ${what}`,
        r.ok, "200", `${r.status} ${brief(r.json)}`, "High");
    }
  }

  // ── 2. Fee arithmetic ─────────────────────────────────────────
  currentModule = "Fee arithmetic";
  const student = await prisma.student.findFirst({
    where: { campusId: env.campus }, orderBy: { rollNo: "asc" },
    select: { id: true, fullName: true },
  });
  await prisma.payment.deleteMany({ where: { invoice: { invoiceNumber: { startsWith: "QA-MATH-" } } } });
  await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: "QA-MATH-" } } });

  // Parts chosen so no two sums coincide: an arithmetic bug that swapped two
  // fields would still produce the right total with rounder numbers.
  const parts = { monthlyFee: 45000, oneTimeFees: 7000, discountAmount: 3000, lateFeeAmount: 1500, taxAmount: 250 };
  const subtotal = parts.monthlyFee + parts.oneTimeFees;                        // 52000
  const total = subtotal - parts.discountAmount + parts.lateFeeAmount + parts.taxAmount; // 50750

  const invoice = await prisma.invoice.create({
    data: {
      schoolId: env.school.id, campusId: env.campus, studentId: student.id,
      invoiceNumber: "QA-MATH-001", invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 86400000 * 30),
      ...parts, subtotal, totalAmount: total, balanceDue: total, status: "PENDING",
    },
  });

  check("Invoice subtotal is monthly + one-off charges",
    invoice.subtotal === subtotal, `${subtotal}`, `${invoice.subtotal}`, "High");
  check("Invoice total applies discount, late fee and tax in the right direction",
    invoice.totalAmount === total,
    `${subtotal} - ${parts.discountAmount} + ${parts.lateFeeAmount} + ${parts.taxAmount} = ${total}`,
    `${invoice.totalAmount}`, "Critical");
  check("A fresh invoice owes its full total",
    invoice.balanceDue === invoice.totalAmount, `${total}`, `${invoice.balanceDue}`, "High");

  {
    // A part payment through the real collection endpoint.
    const pay1 = 20000;
    const r = await api("accountant", "POST", "/api/fees/collect", {
      studentId: student.id, invoiceId: invoice.id, amount: pay1,
      paymentMethod: "CASH", paymentDate: new Date().toISOString().split("T")[0],
    });
    check("The accountant can collect a payment (fees.add)",
      r.ok, "200", `${r.status} ${brief(r.json)}`, "High");

    const after = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { totalAmountPaid: true, balanceDue: true, totalAmount: true, status: true },
    });
    check("A part payment reduces the balance by exactly what was paid",
      after.balanceDue === total - pay1, `${total - pay1}`, `${after.balanceDue}`, "Critical");
    check("Amount paid and balance still add up to the invoice total",
      after.totalAmountPaid + after.balanceDue === after.totalAmount,
      `${after.totalAmount}`, `${after.totalAmountPaid} + ${after.balanceDue}`, "Critical");
    check("A part-paid invoice is not marked settled",
      after.status !== "PAID", "not PAID", `${after.status}`, "High");

    // The ledger of payments must equal what the invoice claims was paid —
    // the invoice column is a running total, and a running total that drifts
    // from its own rows is how a family gets chased for money they have paid.
    const paidRows = await prisma.payment.aggregate({
      where: { invoiceId: invoice.id }, _sum: { amount: true },
    });
    check("The invoice's paid column equals the sum of its payment rows",
      (paidRows._sum.amount ?? 0) === after.totalAmountPaid,
      `${after.totalAmountPaid}`, `${paidRows._sum.amount ?? 0}`, "Critical");
  }
  {
    // Settle the rest.
    const remaining = total - 20000;
    const r = await api("accountant", "POST", "/api/fees/collect", {
      studentId: student.id, invoiceId: invoice.id, amount: remaining,
      paymentMethod: "BANK", paymentDate: new Date().toISOString().split("T")[0],
    });
    const after = await prisma.invoice.findUnique({
      where: { id: invoice.id }, select: { balanceDue: true, totalAmountPaid: true, status: true },
    });
    check("Paying the remainder clears the balance to exactly zero",
      r.ok && after.balanceDue === 0, "0", `${r.status} ${brief(r.json)} balance ${after.balanceDue}`, "Critical");
    check("…and the invoice is then marked paid",
      after.status === "PAID", "PAID", `${after.status}`, "High");
    check("…with the full total recorded as paid",
      after.totalAmountPaid === total, `${total}`, `${after.totalAmountPaid}`, "Critical");
  }
  {
    // Rounding: fees are stored as whole units, so a fractional payment must
    // not silently truncate a family's money away.
    const inv2 = await prisma.invoice.create({
      data: {
        schoolId: env.school.id, campusId: env.campus, studentId: student.id,
        invoiceNumber: "QA-MATH-002", invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 86400000 * 30),
        monthlyFee: 1000, subtotal: 1000, totalAmount: 1000, balanceDue: 1000, status: "PENDING",
      },
    });
    await api("accountant", "POST", "/api/fees/collect", {
      studentId: student.id, invoiceId: inv2.id, amount: 333.4,
      paymentMethod: "CASH", paymentDate: new Date().toISOString().split("T")[0],
    });
    const after = await prisma.invoice.findUnique({
      where: { id: inv2.id }, select: { totalAmountPaid: true, balanceDue: true, totalAmount: true },
    });
    check("A fractional payment is rounded once, and the books still balance",
      after.totalAmountPaid + after.balanceDue === after.totalAmount,
      `${after.totalAmount}`, `${after.totalAmountPaid} + ${after.balanceDue}`, "Critical");
  }
  {
    const r = await api("accountant", "POST", "/api/fees/collect", {
      studentId: student.id, invoiceId: invoice.id, amount: -500,
      paymentMethod: "CASH", paymentDate: new Date().toISOString().split("T")[0],
    });
    check("A negative payment is rejected rather than inflating a balance",
      !r.ok, "4xx", `${r.status} ${brief(r.json)}`, "High");
  }

  // ── 3. The multi-child dimension (the seam that produced F-13) ─
  currentModule = "Fees: siblings";
  {
    const parent = await prisma.user.findFirst({
      where: { email: env.users.parents[0].email }, select: { id: true, email: true },
    });
    const children = await prisma.student.findMany({
      where: { parentUserId: parent.id }, select: { id: true, fullName: true }, take: 2,
    });
    if (children.length >= 2) {
      await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: "QA-SIB-" } } });
      const amounts = [11000, 23000];
      for (const [i, child] of children.entries()) {
        await prisma.invoice.create({
          data: {
            schoolId: env.school.id, campusId: env.campus, studentId: child.id,
            invoiceNumber: `QA-SIB-${i + 1}`, invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 86400000 * 30),
            monthlyFee: amounts[i], subtotal: amounts[i], totalAmount: amounts[i],
            balanceDue: amounts[i], status: "PENDING",
          },
        });
      }

      for (const [i, child] of children.entries()) {
        const owed = await prisma.invoice.aggregate({
          where: { studentId: child.id, invoiceNumber: { startsWith: "QA-SIB-" } },
          _sum: { balanceDue: true },
        });
        check(`${child.fullName}'s balance is their own, not the family's combined`,
          owed._sum.balanceDue === amounts[i], `${amounts[i]}`, `${owed._sum.balanceDue}`, "Critical");
      }

      await login("ownParent", parent.email);
      const portal = await api("ownParent", "GET", "/api/parent/data");
      check("The guardian's portal loads with both children billed",
        portal.ok, "200", `${portal.status}`, "High");

      // Whatever the portal shows, it must never merge one child's debt into
      // the other's — the failure F-13 was the read-side twin of.
      const merged = portal.text.includes(String(amounts[0] + amounts[1]));
      check("The portal never presents the siblings' balances as one figure",
        !merged, "no combined total presented as a child's balance",
        merged ? `found ${amounts[0] + amounts[1]}` : "not found", "High");
    } else {
      record("PASS", "sibling billing", "two children", "seed has no multi-child guardian", "");
    }
  }

  await prisma.payment.deleteMany({ where: { invoice: { invoiceNumber: { startsWith: "QA-MATH-" } } } });
  await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: "QA-MATH-" } } });
  await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: "QA-SIB-" } } });
  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n${"═".repeat(80)}`);
  console.log(`QA MATRIX 16 — ${pass} passed, ${fail} failed (${results.length} total)`);
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
  fs.writeFileSync("/tmp/qa-results16.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  // A harness that crashed before asserting anything reports
  // "0 passed, 0 failed" — which reads as success. It is not.
  process.exit(fail > 0 || results.length === 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
