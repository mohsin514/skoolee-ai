// ─────────────────────────────────────────────────────────────────
// QA harness, part 14 — the three operations roles.
//
//   node scripts/qa-seed.mjs && node scripts/qa-run14.mjs
//
// Accountant, Librarian and Receptionist each have their own portal and their
// own row in the permission matrix, and until now no QA account existed for
// any of them — so none of those matrices had ever been exercised.
//
// Every check is asserted against src/lib/permissions.ts, in both directions:
// what the role is granted must work, and what it is denied must be refused.
// A role that cannot do its job is as much a defect as one that can do too
// much; the first just gets reported as "the product is broken" instead of as
// a security hole.
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const env = JSON.parse(fs.readFileSync("/tmp/qa-env.json", "utf8"));
const prisma = new PrismaClient();

const results = [];
let currentModule = "Accountant";

function record(status, scenario, expected, actual, severity = "") {
  results.push({ module: currentModule, scenario, expected, actual, status, severity });
  const tag = { PASS: "\x1b[32mPASS\x1b[0m", FAIL: "\x1b[31mFAIL\x1b[0m", BLOCK: "\x1b[33mBLOCK\x1b[0m" }[status] ?? status;
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
    console.log(`      \x1b[33m↻ login ${email} got ${res.status}, retry ${attempt + 1}/6 in ${wait}ms\x1b[0m`);
    await new Promise((r) => setTimeout(r, wait));
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
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ok: res.ok, json };
}
const brief = (o) => (o === undefined ? "undefined" : JSON.stringify(o) ?? "undefined").slice(0, 160);

/** Granted: anything but 401/403 counts — a 400 or 404 means the gate let us through. */
const allowed = (res) => res.status !== 401 && res.status !== 403;
const denied = (res) => res.status === 403 || res.status === 401;

async function run() {
  const { users, classes } = env;
  for (const [k, e] of [
    ["admin", users.admin],
    ["accountant", users.accountant.email],
    ["librarian", users.librarian.email],
    ["receptionist", users.receptionist.email],
  ]) await login(k, e);

  // ── ACCOUNTANT ────────────────────────────────────────────────
  // Matrix: fees view/add/edit · accounts view/add/edit · payroll view ·
  //         students view · staff view · reports view · attendance view
  //         NO exams, NO library, NO admissions, NO timetable, NO front-desk
  currentModule = "Accountant";
  {
    const r = await api("accountant", "GET", "/api/fees/invoices");
    check("Accountant CAN view fee invoices (fees.view)",
      allowed(r), "not 403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("accountant", "GET", "/api/payroll");
    check("Accountant CAN view payroll (payroll.view)",
      allowed(r), "not 403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("accountant", "GET", "/api/students?limit=5");
    check("Accountant CAN view the student roster (students.view)",
      allowed(r), "not 403", `${r.status} ${brief(r.json)}`, "Medium");
  }
  {
    const r = await api("accountant", "POST", "/api/exams", {
      title: "QA Accountant Exam", examType: "MID_TERM", classId: classes.g5a,
      academicYear: env.years.y1, term: "TERM_1",
    });
    check("Accountant CANNOT create exams (exams: no access)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "Critical");
  }
  {
    const r = await api("accountant", "POST", "/api/library/books", {
      title: "QA Accountant Book", author: "QA", isbn: "QA-ACC-1", totalCopies: 1,
    });
    check("Accountant CANNOT add library books (library: no access)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("accountant", "POST", "/api/admission-queries", {
      studentName: "QA Accountant Lead", guardianName: "QA", phone: "03001234567", source: "WEBSITE",
    });
    check("Accountant CANNOT create admission enquiries (admissions: no access)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("accountant", "POST", "/api/students", {
      students: [{
        fullName: "QA Accountant Student", rollNo: "QA-ACC-99", gender: "MALE",
        classId: classes.g5a,
      }],
    });
    check("Accountant CANNOT enrol students (students: view only)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "Critical");
  }

  // ── LIBRARIAN ─────────────────────────────────────────────────
  // Matrix: library view/add/edit/delete · students view · reports view ·
  //         leave view. NOTHING else — no fees, no exams, no attendance.
  currentModule = "Librarian";
  let bookId = null;
  {
    const r = await api("librarian", "POST", "/api/library/books", {
      title: "QA Librarian Book", author: "QA Author", isbn: "QA-LIB-1", totalCopies: 3,
    });
    bookId = r.json?.data?.id ?? r.json?.book?.id;
    check("Librarian CAN add a library book (library.add)",
      allowed(r), "not 403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("librarian", "GET", "/api/library/books");
    check("Librarian CAN list library books (library.view)",
      allowed(r), "not 403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("librarian", "GET", "/api/fees/invoices");
    check("Librarian CANNOT view fees (fees: no access)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("librarian", "POST", "/api/exams", {
      title: "QA Librarian Exam", examType: "MID_TERM", classId: classes.g5a,
      academicYear: env.years.y1, term: "TERM_1",
    });
    check("Librarian CANNOT create exams (exams: no access)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "Critical");
  }
  {
    const r = await api("librarian", "POST", "/api/attendance", {
      classId: classes.g5a, date: `${env.years.y1}-09-03`,
      entries: [{ studentId: env.students[0].id, status: "PRESENT" }],
    });
    check("Librarian CANNOT mark attendance (attendance: no access)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("librarian", "GET", "/api/payroll");
    check("Librarian CANNOT view payroll (payroll: no access)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "Critical");
  }

  // ── RECEPTIONIST ──────────────────────────────────────────────
  // Matrix: front-desk full · admissions view/add · fees view/add (collect,
  //         not edit) · attendance view/add · leave view/add · students view ·
  //         timetable view · reports view. NO exams, NO library, NO payroll,
  //         NO accounts, NO staff.
  currentModule = "Receptionist";
  {
    const r = await api("receptionist", "POST", "/api/admission-queries", {
      studentName: "QA Reception Lead", guardianName: "QA Guardian",
      phone: "03007654321", source: "WALK_IN",
    });
    check("Receptionist CAN create an admission enquiry (admissions.add)",
      allowed(r), "not 403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("receptionist", "GET", "/api/front-desk/complaints");
    check("Receptionist CAN use the front desk (front-desk.view)",
      allowed(r), "not 403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("receptionist", "GET", "/api/fees/invoices");
    check("Receptionist CAN view fee invoices (fees.view)",
      allowed(r), "not 403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("receptionist", "GET", "/api/timetable");
    check("Receptionist CAN view the timetable (timetable.view)",
      allowed(r), "not 403", `${r.status} ${brief(r.json)}`, "Medium");
  }
  {
    const r = await api("receptionist", "POST", "/api/exams", {
      title: "QA Reception Exam", examType: "MID_TERM", classId: classes.g5a,
      academicYear: env.years.y1, term: "TERM_1",
    });
    check("Receptionist CANNOT create exams (exams: no access)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "Critical");
  }
  {
    const r = await api("receptionist", "GET", "/api/payroll");
    check("Receptionist CANNOT view payroll (payroll: no access)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "Critical");
  }
  {
    const r = await api("receptionist", "POST", "/api/library/books", {
      title: "QA Reception Book", author: "QA", isbn: "QA-REC-1", totalCopies: 1,
    });
    check("Receptionist CANNOT add library books (library: no access)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "High");
  }
  {
    const r = await api("receptionist", "POST", "/api/staff", {
      email: "qa+recephire@example.invalid", fullName: "QA Hire", role: "TEACHER",
    });
    check("Receptionist CANNOT invite staff (staff: no access)",
      denied(r), "403", `${r.status} ${brief(r.json)}`, "Critical");
  }

  // ── Shared boundaries ─────────────────────────────────────────
  // None of the three is an academic role, and none may reach the marks chain
  // or the admin portal's privileged writes.
  currentModule = "Operations boundaries";
  {
    for (const who of ["accountant", "librarian", "receptionist"]) {
      const r = await api(who, "POST", "/api/students/promote", {
        studentIds: [env.students[0].id], toClassId: classes.g6aY2, finalPercentage: 80,
      });
      check(`${who} CANNOT promote students`,
        denied(r), "403", `${r.status} ${brief(r.json)}`, "Critical");
    }
  }
  {
    for (const who of ["accountant", "librarian", "receptionist"]) {
      const r = await api(who, "GET", "/api/teachers/availability");
      const isStaff = allowed(r);
      record(isStaff ? "PASS" : "FAIL",
        `${who} is treated as staff, not as a family account`,
        "not 403 (staff-only route)", `${r.status}`, isStaff ? "" : "Medium");
    }
  }

  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n${"═".repeat(80)}`);
  console.log(`QA MATRIX 14 — ${pass} passed, ${fail} failed (${results.length} total)`);
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
  fs.writeFileSync("/tmp/qa-results14.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  // A harness that crashed before asserting anything reports
  // "0 passed, 0 failed" — which reads as success. It is not.
  process.exit(fail > 0 || results.length === 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
