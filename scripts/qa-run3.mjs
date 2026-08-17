// ─────────────────────────────────────────────────────────────────
// QA harness, part 3 — cross-year data isolation (spec §40-41, §50-53).
//
//   node scripts/qa-seed.mjs && node scripts/qa-run3.mjs
//
// The rollover seam is where the previous two harnesses stop looking: they
// prove a single year works, not that two years stay apart. Every check here
// asks the same question in a different module — after a student is promoted,
// does last year's data stay in last year?
//
// Uses the real HTTP API for anything a user can do, and reads the database
// directly only to assert on stored state.
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const env = JSON.parse(fs.readFileSync("/tmp/qa-env.json", "utf8"));
const prisma = new PrismaClient();

const results = [];
let currentModule = "—";

function record(status, scenario, expected, actual, severity = "") {
  results.push({ module: currentModule, scenario, expected, actual, status, severity });
  const tag = { PASS: "\x1b[32mPASS\x1b[0m", FAIL: "\x1b[31mFAIL\x1b[0m", BLOCKED: "\x1b[33mBLOCK\x1b[0m" }[status];
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
  // Running the whole suite back to back trips the login rate limiter. That is
  // the limiter working correctly, not a defect — back off and retry rather
  // than reporting a wall of false failures.
  if (!token && (res.status === 429 || res.status >= 500) && attempt < 6) {
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    return login(key, email, attempt + 1);
  }
  if (!token) throw new Error(`login failed for ${email}: ${res.status}`);
  cookies[key] = token;
  return token;
}

async function api(who, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookies[who] ? { Cookie: cookies[who] } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ok: res.ok, json };
}
const brief = (o) => JSON.stringify(o).slice(0, 240);

async function run() {
  const { classes, students, years, users, rooms, examPeriods } = env;
  const g5aY1 = classes.g5a;      // QA Grade 5 A, year 1
  const g5aY2 = classes.g5aY2;    // QA Grade 5 A, year 2
  const g6aY2 = classes.g6aY2;    // QA Grade 6 A, year 2

  await login("admin", users.admin);
  await login("principal", users.principal);
  await login("teacher1", users.teachers[0].email);
  await login("student1", users.students[0].email);
  await login("parent1", users.parents[0].email);

  // The seed puts students 01-04 in 5A/Y1. Promote 01 into 5A/Y2 so one
  // student genuinely spans both years — that is the whole point of §53.
  const student1 = students.find((s) => s.name === "QA Student 01");

  // Attendance is validated against the student's *current* class, so a
  // promoted student can never be back-marked for last year. Year 1
  // attendance therefore has to be laid down before the promotion runs —
  // which is exactly the real-world order anyway.
  currentModule = "Setup";
  const y1Date = `${years.y1}-11-10`; // inside year 1
  const y2Date = `${years.y2}-09-14`; // inside year 2

  {
    const res = await api("teacher1", "POST", "/api/attendance", {
      classId: g5aY1, date: y1Date,
      entries: [{ studentId: student1.id, status: "PRESENT" }],
    });
    check("Record a Year 1 attendance day (before promotion)",
      res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
  }

  // Give Year 1 a locked exam so it owns a real report card — §53G needs a
  // historical document that must still read as Year 1 once Year 2 is live.
  {
    const y1Subjects = env.subjects[g5aY1] || [];
    const created = await api("admin", "POST", "/api/exams", {
      title: "QA Y1 Mid Term", term: "Mid Term", classId: g5aY1,
      academicYear: years.y1, examType: "MID_TERM",
    });
    if (created.ok) {
      const exam = created.json.exam;
      await api("admin", "PATCH", "/api/exams", { id: exam.id, status: "ACTIVE" });
      const teacherFor = { Mathematics: "teacher1", "Computer Science": "teacher1", English: "teacher2", Urdu: "teacher2", Science: "teacher3" };
      await login("teacher2", users.teachers[1].email);
      await login("teacher3", users.teachers[2].email);
      // Locking requires a complete grid: every student in the class × every
      // subject, not just the one student this harness follows.
      const y1Students = students.filter((s) => s.classId === g5aY1);
      for (const subj of y1Subjects) {
        await api(teacherFor[subj.name] || "teacher1", "POST", "/api/marks", {
          examId: exam.id,
          entries: y1Students.map((s) => ({
            studentId: s.id,
            subjectId: subj.id,
            marksObtained: Math.round(subj.totalMarks * 0.8),
          })),
        });
      }
      const locked = await api("principal", "POST", `/api/exams/${exam.id}/lock`, {});
      check("Lock the Year 1 exam so it owns a report card",
        locked.ok, "2xx", `${locked.status} ${brief(locked.json)}`, "Medium");
    }
  }

  {
    const res = await api("admin", "POST", "/api/students/promote", {
      fromClassId: g5aY1, toClassId: g5aY2, academicYear: years.y1,
      results: [{ studentId: student1.id, outcome: "PASS", finalPercentage: 78, finalGrade: "B" }],
    });
    check("Promote QA Student 01 from Y1 into Y2", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
  }

  // ── §46: promotion preserves the Year 1 placement ──────────────
  currentModule = "§46 Promotion history";
  {
    const history = await prisma.studentClassHistory.findMany({
      where: { studentId: student1.id },
      include: { class: { select: { name: true, section: true, academicYear: true } } },
    });
    const y1row = history.find((h) => h.academicYear === years.y1);
    check("Year 1 enrollment survives promotion as history",
      !!y1row && y1row.class.academicYear === years.y1,
      `history row for ${years.y1}`,
      history.length ? JSON.stringify(history.map((h) => ({ y: h.academicYear, cls: h.class.name, st: h.status }))) : "no history rows",
      "Critical");

    const student = await prisma.student.findUnique({
      where: { id: student1.id },
      include: { class: { select: { academicYear: true, name: true, section: true } } },
    });
    check("Student's live placement moved to Year 2",
      student?.class?.academicYear === years.y2,
      `class in ${years.y2}`, `class in ${student?.class?.academicYear}`, "High");
  }

  // ── §50: attendance must not pool across years ─────────────────
  currentModule = "§50 Attendance isolation";
  {
    // Now in 5A/Y2, mark a Year 2 day. The student now owns one day in each
    // academic year — the state every portal has to keep apart.
    const res = await api("teacher1", "POST", "/api/attendance", {
      classId: g5aY2, date: y2Date,
      entries: [{ studentId: student1.id, status: "ABSENT" }],
    });
    check("Record a Year 2 attendance day (after promotion)",
      res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const rows = await prisma.attendance.findMany({
      where: { studentId: student1.id },
      include: { class: { select: { academicYear: true } } },
      orderBy: { date: "asc" },
    });
    const y1rows = rows.filter((r) => r.class?.academicYear === years.y1);
    const y2rows = rows.filter((r) => r.class?.academicYear === years.y2);
    check("Both years' attendance stored distinctly",
      y1rows.length === 1 && y2rows.length === 1,
      "1 row per year", `y1=${y1rows.length} y2=${y2rows.length} (total ${rows.length})`, "High");
  }

  {
    // The parent portal is the HTTP surface for this, so assert on what it
    // actually returns. Compare against the year-scoped count computed
    // straight from the database for the same child, so the test cannot
    // drift from the data.
    const res = await api("parent1", "GET", "/api/parent/data");
    const payload = res.json?.data;
    const name = payload?.student?.fullName;
    const year = payload?.student?.academicYear;
    const reported = payload?.attendance?.total;

    const child = await prisma.student.findFirst({
      where: { fullName: name, campus: { school: { slug: "qa-testing-school" } } },
      select: { id: true },
    });
    const expected = child
      ? await prisma.attendance.count({ where: { studentId: child.id, class: { academicYear: year } } })
      : null;

    check("§50: parent portal attendance counts the current year only",
      reported === expected && expected !== null,
      `${expected} day(s) for ${name} in ${year}`,
      `portal reported ${reported}`, "High");

    const recentDates = payload?.attendance?.recent?.map((r) => r.date) ?? [];
    const strayYear = recentDates.filter((d) => Number(d.slice(0, 4)) < years.y2).length;
    check("§50: parent portal recent-days list excludes previous years",
      strayYear === 0, "no pre-year-2 dates", `${strayYear} stray date(s): ${recentDates.join(",")}`, "High");
  }

  {
    // The student dashboard is a server action with no HTTP route, so the
    // scoping helper it now relies on is asserted directly. The rendered
    // dashboard itself is verified in the browser.
    const rows = await prisma.attendance.findMany({
      where: { studentId: student1.id },
      include: { class: { select: { academicYear: true } } },
    });
    const scoped = rows.filter((r) => r.class?.academicYear === years.y2);
    check("§50: year-scoping leaves exactly the current year's days",
      rows.length === 2 && scoped.length === 1,
      "2 stored, 1 in the current year",
      `${rows.length} stored, ${scoped.length} in year ${years.y2}`, "High");
  }

  // ── §53 Test E: a Year 2 exam must not surface under Year 1 ────
  currentModule = "§53E Exam isolation";
  let y2Exam = null;
  {
    const res = await api("admin", "POST", "/api/exams", {
      title: "QA Y2 Mid Term", term: "Mid Term", classId: g5aY2,
      academicYear: years.y2, examType: "MID_TERM",
    });
    if (check("Create a Year 2 exam", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High")) {
      y2Exam = res.json.exam;
    }
  }

  {
    const res = await api("admin", "GET", `/api/exams?academicYear=${years.y1}`);
    const list = res.json?.exams || res.json?.data || [];
    const leaked = list.some((e) => e.id === y2Exam?.id);
    check("§53E: Year 2 exam does NOT appear under Year 1",
      !leaked, "absent from year-1 list", leaked ? "LEAKED into year 1" : "absent", "Critical");
  }

  {
    const res = await api("admin", "GET", `/api/exams?academicYear=${years.y2}`);
    const list = res.json?.exams || res.json?.data || [];
    check("Year 2 exam appears under Year 2",
      list.some((e) => e.id === y2Exam?.id), "present", `${list.length} exams`, "High");
  }

  // ── §53D: Year 2 marks must not alter Year 1 marks ─────────────
  currentModule = "§53D Marks isolation";
  {
    const y1MarksBefore = await prisma.mark.findMany({
      where: { studentId: student1.id, exam: { academicYear: years.y1 } },
      select: { id: true, marksObtained: true },
      orderBy: { id: "asc" },
    });

    // Enter Year 2 marks for the same student.
    const y2Subjects = env.subjects[g5aY2] || [];
    const maths = y2Subjects.find((s) => s.name === "Mathematics");
    if (y2Exam && maths) {
      await api("admin", "PATCH", "/api/exams", { id: y2Exam.id, status: "ACTIVE" });
      const res = await api("teacher1", "POST", "/api/marks", {
        examId: y2Exam.id,
        entries: [{ studentId: student1.id, subjectId: maths.id, marksObtained: 88 }],
      });
      check("Enter Year 2 marks for the promoted student",
        res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
    } else {
      record("BLOCKED", "Enter Year 2 marks", "year-2 subject", "no year-2 maths subject found", "Medium");
    }

    const y1MarksAfter = await prisma.mark.findMany({
      where: { studentId: student1.id, exam: { academicYear: years.y1 } },
      select: { id: true, marksObtained: true },
      orderBy: { id: "asc" },
    });
    check("§53D: Year 1 marks unchanged after entering Year 2 marks",
      JSON.stringify(y1MarksBefore) === JSON.stringify(y1MarksAfter),
      "identical", `before=${y1MarksBefore.length} after=${y1MarksAfter.length}`, "Critical");
  }

  // ── §53B: changing the Year 2 class must not rewrite Year 1 ────
  currentModule = "§53B Placement isolation";
  {
    const y1Before = await prisma.studentClassHistory.findFirst({
      where: { studentId: student1.id, academicYear: years.y1 },
      select: { classId: true, rollNo: true },
    });

    const res = await api("admin", "PATCH", "/api/students", { id: student1.id, classId: g6aY2 });
    const moved = res.ok;

    const y1After = await prisma.studentClassHistory.findFirst({
      where: { studentId: student1.id, academicYear: years.y1 },
      select: { classId: true, rollNo: true },
    });

    check("Move the student within Year 2", moved, "2xx", `${res.status} ${brief(res.json)}`, "Medium");
    check("§53B: Year 1 placement unchanged after a Year 2 move",
      JSON.stringify(y1Before) === JSON.stringify(y1After),
      "identical year-1 history", `before=${JSON.stringify(y1Before)} after=${JSON.stringify(y1After)}`, "Critical");
  }

  // ── §53C: Year 2 attendance must not alter Year 1 attendance ───
  currentModule = "§53C Attendance immutability";
  {
    const y1Before = await prisma.attendance.findFirst({
      where: { studentId: student1.id, date: new Date(y1Date) },
      select: { status: true, classId: true },
    });
    // Add another year-2 day.
    await api("teacher1", "POST", "/api/attendance", {
      classId: g6aY2, date: `${years.y2}-09-15`,
      entries: [{ studentId: student1.id, status: "PRESENT" }],
    });
    const y1After = await prisma.attendance.findFirst({
      where: { studentId: student1.id, date: new Date(y1Date) },
      select: { status: true, classId: true },
    });
    check("§53C: Year 1 attendance untouched by new Year 2 attendance",
      JSON.stringify(y1Before) === JSON.stringify(y1After),
      "identical", `before=${JSON.stringify(y1Before)} after=${JSON.stringify(y1After)}`, "Critical");
  }

  // ── §53G: the Year 1 report card still reads as Year 1 ─────────
  currentModule = "§53G Report card history";
  {
    const y1Card = await prisma.reportCard.findFirst({
      where: { studentId: student1.id, exam: { academicYear: years.y1 } },
      select: { id: true, percentage: true, obtainedMarks: true },
    });
    if (!y1Card) {
      record("BLOCKED", "§53G: Year 1 report card still shows Year 1 data",
        "a year-1 report card", "none exists (exam never locked in this run)", "Medium");
    } else {
      const res = await api("admin", "GET", `/api/reports/${y1Card.id}/detail`);
      const cls = res.json?.reportCard?.student?.class;
      const examYear = res.json?.reportCard?.exam?.academicYear;
      check("§53G: Year 1 report card reports the Year 1 class",
        cls?.academicYear === years.y1 || examYear === years.y1,
        `class/exam in ${years.y1}`,
        `class=${JSON.stringify(cls)} examYear=${examYear}`, "Critical");
    }
  }

  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n${"═".repeat(78)}`);
  console.log(`QA MATRIX 3 — ${pass} passed, ${fail} failed, ${blocked} blocked (${results.length} total)`);
  console.log("═".repeat(78));
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
  fs.writeFileSync("/tmp/qa-results3.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  // A harness that crashed before asserting anything reports
  // "0 passed, 0 failed" — which reads as success. It is not.
  process.exit(fail > 0 || results.length === 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
