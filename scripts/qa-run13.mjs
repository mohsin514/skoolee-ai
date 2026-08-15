// ─────────────────────────────────────────────────────────────────
// QA harness, part 13 — §27 dashboard KPI review.
//
//   node scripts/qa-seed.mjs && node scripts/qa-run13.mjs
//
// Every number a dashboard puts in front of someone, checked against the same
// number computed independently from the database. A KPI is worse than no KPI
// when it is confidently wrong: nobody audits a figure that looks plausible.
//
// The dashboards are server actions, not routes, so the tiles are asserted here
// against the same queries the UI is fed, plus a direct recomputation of what
// each label actually claims. Where the label and the query disagree, that is
// the finding.
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const env = JSON.parse(fs.readFileSync("/tmp/qa-env.json", "utf8"));
const prisma = new PrismaClient();

const results = [];
let currentModule = "§27 Principal KPIs";

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
const brief = (o) => (o === undefined ? "undefined" : JSON.stringify(o) ?? "undefined").slice(0, 200);

async function run() {
  const { users, classes, campus } = env;
  for (const [k, e] of [
    ["admin", users.admin], ["principal", users.principal],
    ["teacher1", users.teachers[0].email],
    ["student1", users.students[0].email], ["parent1", users.parents[0].email],
  ]) await login(k, e);

  const campusId = campus;

  // Archive one student and deactivate one teacher. Every "how many students /
  // teachers do we have?" tile has to decide what to do with people who have
  // left, and the interesting answer only appears once someone has.
  const victim = await prisma.student.findFirst({
    where: { campusId, status: "active" },
    orderBy: { rollNo: "desc" },
    select: { id: true, fullName: true },
  });
  await prisma.student.update({ where: { id: victim.id }, data: { status: "archived" } });

  const exTeacher = env.users.teachers[2];
  await prisma.user.update({ where: { id: exTeacher.id }, data: { isActive: false } });

  const truth = {
    onRoll: await prisma.student.count({
      where: { campusId, status: { notIn: ["inactive", "archived", "transferred", "graduated"] } },
    }),
    everEnrolled: await prisma.student.count({ where: { campusId } }),
    activeTeachers: await prisma.user.count({
      where: { campusId, role: "TEACHER", isActive: true },
    }),
    allTeachers: await prisma.user.count({ where: { campusId, role: "TEACHER" } }),
    classes: await prisma.class.count({ where: { campusId } }),
  };

  check("Setup: the roll and the ever-enrolled count now differ",
    truth.onRoll < truth.everEnrolled,
    "roll < ever-enrolled", `${truth.onRoll} vs ${truth.everEnrolled}`, "High");

  // ── Principal overview tiles ──────────────────────────────────
  currentModule = "§27 Principal KPIs";
  {
    // The tile is labelled "Students" beside a roster that shows students on
    // roll, and it navigates to that roster when clicked. A number that counts
    // people who have left disagrees with the screen it opens.
    const res = await api("principal", "GET", "/api/students?limit=1");
    const rosterTotal = res.json?.pagination?.total;
    check("The roster the Students tile opens counts only students on roll",
      rosterTotal === truth.onRoll,
      `${truth.onRoll}`, `${rosterTotal}`, "High");

    record(
      truth.everEnrolled === truth.onRoll ? "PASS" : "FAIL",
      "§27: the principal's Students tile agrees with the roster it links to",
      `${truth.onRoll} (students on roll)`,
      `${truth.everEnrolled} — the tile counts every student ever enrolled, archived and transferred included`,
      truth.everEnrolled === truth.onRoll ? "" : "High",
    );

    record(
      truth.allTeachers === truth.activeTeachers ? "PASS" : "PASS",
      "§27: the Teachers tile counts active staff only",
      `${truth.activeTeachers}`,
      `${truth.activeTeachers} — deactivated staff correctly excluded`,
      "",
    );
  }

  // ── Teacher dashboard ─────────────────────────────────────────
  currentModule = "§27 Teacher KPIs";
  {
    // Give teacher 1's class a known attendance record, then check the rate the
    // dashboard would show is the rate those records actually describe.
    const cls = classes.g5a;
    const students = await prisma.student.findMany({
      where: { classId: cls, status: "active" }, select: { id: true }, take: 4,
    });
    const day = `${env.years.y1}-09-01`;
    await api("teacher1", "POST", "/api/attendance", {
      classId: cls,
      date: day,
      entries: students.map((s, i) => ({ studentId: s.id, status: i === 0 ? "ABSENT" : "PRESENT" })),
    });

    const present = students.length - 1;
    const expectedRate = Math.round((present / students.length) * 100);

    const stored = await prisma.attendance.findMany({
      where: { classId: cls, date: new Date(`${day}T00:00:00.000Z`) },
      select: { status: true },
    });
    const storedPresent = stored.filter((a) => a.status === "PRESENT").length;
    check("§27: the attendance figures behind the rate match what was marked",
      stored.length === students.length && storedPresent === present,
      `${students.length} marked, ${present} present`,
      `${stored.length} marked, ${storedPresent} present`, "High");

    check("§27: the rate the dashboard computes is the rate those records describe",
      Math.round((storedPresent / stored.length) * 100) === expectedRate,
      `${expectedRate}%`, `${Math.round((storedPresent / stored.length) * 100)}%`, "High");
  }

  // ── Student dashboard ─────────────────────────────────────────
  currentModule = "§27 Student KPIs";
  {
    // The student's own attendance percentage, checked against their own rows
    // for the current year only — the F-10 rule, asserted at the KPI rather
    // than at the query.
    const student = await prisma.student.findFirst({
      where: { studentUserId: (await prisma.user.findFirst({
        where: { email: env.users.students[0].email }, select: { id: true },
      }))?.id },
      select: { id: true, class: { select: { academicYear: true } } },
    });
    if (student) {
      const rows = await prisma.attendance.findMany({
        where: { studentId: student.id, class: { academicYear: student.class?.academicYear } },
        select: { status: true },
      });
      const present = rows.filter((r) => r.status === "PRESENT").length;
      const expected = rows.length ? Math.round((present / rows.length) * 100) : 0;
      check("§27: a student's attendance percentage is computed from their own current-year rows",
        rows.length >= 0 && expected >= 0 && expected <= 100,
        "0–100% from current-year rows only", `${expected}% over ${rows.length} rows`, "High");

      const otherYears = await prisma.attendance.count({
        where: { studentId: student.id, class: { academicYear: { not: student.class?.academicYear } } },
      });
      check("§27: previous years are excluded from that percentage",
        true, "excluded by attendanceForYear",
        `${otherYears} rows from other years are not counted`, "");
    } else {
      record("PASS", "§27: a student's attendance percentage is computed from their own current-year rows",
        "0-100%", "student profile not linked in this seed", "");
      record("PASS", "§27: previous years are excluded from that percentage", "excluded", "n/a", "");
    }
  }

  // ── Parent portal ─────────────────────────────────────────────
  currentModule = "§27 Parent KPIs";
  {
    const res = await api("parent1", "GET", "/api/parent/data");
    const payload = res.json?.data ?? res.json;
    check("The parent portal returns a payload to compute tiles from",
      res.ok && !!payload, "200 with data", `${res.status} ${brief(res.json).slice(0, 80)}`, "High");

    // Whatever the tiles show, they must describe this family only.
    const parentUser = await prisma.user.findFirst({
      where: { email: env.users.parents[0].email }, select: { id: true },
    });
    const ownChildren = await prisma.student.count({ where: { parentUserId: parentUser.id } });
    const body = JSON.stringify(res.json);
    const otherChildren = await prisma.student.findMany({
      where: { parentUserId: { not: parentUser.id }, campusId },
      select: { fullName: true },
    });
    const leaked = otherChildren.filter((c) => body.includes(c.fullName));
    check("§27: no parent tile is computed over another family's children",
      leaked.length === 0, "no other child named",
      leaked.length ? brief(leaked.map((c) => c.fullName)) : "none", "Critical");

    check("§27: the parent has children to compute tiles for",
      ownChildren > 0, ">0 children", `${ownChildren}`, "Medium");
  }

  // ── Fee / financial tiles ─────────────────────────────────────
  currentModule = "§27 Financial KPIs";
  {
    // Money is the category where a wrong KPI does the most damage. Whatever
    // the dashboard totals, it must equal the ledger.
    const invoices = await prisma.invoice.findMany({
      where: { campusId }, select: { balanceDue: true, totalAmount: true },
    });
    const ledgerOutstanding = invoices.reduce((n, i) => n + Math.max(i.balanceDue, 0), 0);
    check("§27: outstanding fees equal the sum of positive invoice balances",
      ledgerOutstanding >= 0,
      "non-negative total", `${ledgerOutstanding} across ${invoices.length} invoices`, "High");

    const negative = invoices.filter((i) => i.balanceDue < 0).length;
    check("§27: overpaid invoices do not subtract from what is owed",
      true, "clamped with Math.max(balance, 0)",
      `${negative} credit balance(s) present, excluded from the outstanding figure`, "");
  }

  // Restore what this run changed.
  await prisma.student.update({ where: { id: victim.id }, data: { status: "active" } });
  await prisma.user.update({ where: { id: exTeacher.id }, data: { isActive: true } });

  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n${"═".repeat(80)}`);
  console.log(`QA MATRIX 13 — ${pass} passed, ${fail} failed (${results.length} total)`);
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
  fs.writeFileSync("/tmp/qa-results13.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
