// ─────────────────────────────────────────────────────────────────
// QA harness, part 5 — authorization by direct request (§23),
// result-release states (§20), and input edge cases (§25).
//
//   node scripts/qa-seed.mjs && node scripts/qa-run5.mjs
//
// Every check here bypasses the UI entirely and talks to the API with a real
// session cookie for the role under test. A hidden button proves nothing; the
// only question is what the server does when asked directly.
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
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, ok: res.ok, json };
}
const brief = (o) => JSON.stringify(o).slice(0, 180);
const denied = (s) => s === 401 || s === 403 || s === 404;

async function run() {
  const { classes, students, years, users, rooms, examPeriods } = env;
  const g5a = classes.g5a;
  const g5aSubjects = env.subjects[g5a];
  const g5aStudents = students.filter((s) => s.classId === g5a);
  const g5bStudents = students.filter((s) => s.classId === classes.g5b);

  for (const [k, e] of [
    ["admin", users.admin], ["principal", users.principal],
    ["teacher1", users.teachers[0].email], ["teacher2", users.teachers[1].email],
    ["teacher3", users.teachers[2].email],
    ["parent1", users.parents[0].email], ["parent3", users.parents[2].email],
    ["student1", users.students[0].email], ["student5", users.students[4].email],
  ]) await login(k, e);

  // ── Build a locked exam so there is a real report card to guard ─
  currentModule = "Setup";
  let exam = null;
  {
    const res = await api("admin", "POST", "/api/exams", {
      title: "QA Sec Term", term: "Mid Term", classId: g5a,
      academicYear: years.y1, examType: "MID_TERM",
    });
    if (check("Create exam", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High")) exam = res.json.exam;
  }
  if (!exam) return report();
  await api("admin", "PATCH", "/api/exams", { id: exam.id, status: "ACTIVE" });

  const teacherFor = { Mathematics: "teacher1", "Computer Science": "teacher1", English: "teacher2", Urdu: "teacher2", Science: "teacher3" };
  for (const subj of g5aSubjects) {
    await api(teacherFor[subj.name], "POST", "/api/marks", {
      examId: exam.id,
      entries: g5aStudents.map((s) => ({ studentId: s.id, subjectId: subj.id, marksObtained: Math.round(subj.totalMarks * 0.7) })),
    });
  }
  await api("principal", "POST", `/api/exams/${exam.id}/lock`, {});

  const card = await prisma.reportCard.findFirst({
    where: { examId: exam.id, studentId: g5aStudents[0].id },
    select: { id: true, status: true },
  });
  check("A report card exists to guard", !!card, "1 report card", card ? card.status : "none", "High");
  if (!card) return report();

  // ── §23 Report card access ─────────────────────────────────────
  currentModule = "§23 Report cards";
  {
    const res = await api("student1", "GET", `/api/reports/${card.id}/detail`);
    check("Student cannot open the staff report-card endpoint",
      denied(res.status), "401/403/404", `${res.status} ${brief(res.json)}`, "Critical");
  }
  {
    const res = await api("parent1", "GET", `/api/reports/${card.id}/detail`);
    check("Parent cannot open the staff report-card endpoint",
      denied(res.status), "401/403/404", `${res.status} ${brief(res.json)}`, "Critical");
  }
  {
    // Card is GENERATED, not released — a family must not be able to pull the
    // PDF for it even for their own child.
    const res = await api("parent1", "GET", `/api/reports/download?reportCardId=${card.id}`);
    check("§20: parent cannot download an unreleased report card",
      denied(res.status), "denied while GENERATED", `${res.status} ${brief(res.json)}`, "Critical");
  }
  {
    // Parent 3's children are in 5B; this card belongs to a 5A child.
    const res = await api("parent3", "GET", `/api/reports/download?reportCardId=${card.id}`);
    check("Parent cannot download another family's report card",
      denied(res.status), "401/403/404", `${res.status} ${brief(res.json)}`, "Critical");
  }
  {
    const res = await api("student5", "GET", `/api/reports/download?reportCardId=${card.id}`);
    check("Student cannot download a classmate's report card",
      denied(res.status), "401/403/404", `${res.status} ${brief(res.json)}`, "Critical");
  }

  // ── §23 Staff-only actions attempted by families ───────────────
  currentModule = "§23 Privileged actions";
  const forbidden = [
    ["student1", "POST", "/api/students/promote", { fromClassId: g5a, toClassId: classes.g6aY2, academicYear: years.y1, results: [{ studentId: g5aStudents[0].id, outcome: "PASS" }] }, "Student cannot promote students"],
    ["parent1", "POST", "/api/students/promote", { fromClassId: g5a, toClassId: classes.g6aY2, academicYear: years.y1, results: [{ studentId: g5aStudents[0].id, outcome: "PASS" }] }, "Parent cannot promote students"],
    ["student1", "POST", `/api/exams/${exam.id}/lock`, {}, "Student cannot lock an exam"],
    ["parent1", "POST", `/api/exams/${exam.id}/reject`, { reason: "I disagree with these marks" }, "Parent cannot reject marks"],
    ["student1", "POST", "/api/exams", { title: "Hacked", term: "Mid Term", classId: g5a, academicYear: years.y1, examType: "MID_TERM" }, "Student cannot create an exam"],
    ["parent1", "POST", "/api/academic/exam-schedule", { examId: exam.id, subjectId: g5aSubjects[0].id, date: `${years.y1}-11-12`, periodDefinitionId: examPeriods[0], roomId: rooms["QA-C"].id }, "Parent cannot write the date sheet"],
    ["student1", "POST", "/api/timetable", { classId: g5a, academicYear: years.y1, term: "ANNUAL" }, "Student cannot create a timetable"],
    ["teacher1", "POST", "/api/students/promote", { fromClassId: g5a, toClassId: classes.g6aY2, academicYear: years.y1, results: [{ studentId: g5aStudents[0].id, outcome: "PASS" }] }, "Teacher cannot promote students"],
    ["student1", "POST", "/api/attendance", { classId: g5a, date: `${years.y1}-11-12`, entries: [{ studentId: g5aStudents[0].id, status: "PRESENT" }] }, "Student cannot mark attendance"],
    ["parent1", "POST", "/api/attendance", { classId: g5a, date: `${years.y1}-11-12`, entries: [{ studentId: g5aStudents[0].id, status: "PRESENT" }] }, "Parent cannot mark attendance"],
  ];
  for (const [who, method, path, body, label] of forbidden) {
    const res = await api(who, method, path, body);
    check(label, denied(res.status), "401/403/404", `${res.status} ${brief(res.json)}`, "Critical");
  }

  // ── §23 Roster reads by families ───────────────────────────────
  currentModule = "§23 Roster reads";
  for (const [who, path, label] of [
    ["student1", "/api/students", "Student cannot list the student roster"],
    ["parent1", "/api/students", "Parent cannot list the student roster"],
    ["student1", "/api/teachers", "Student cannot list staff records"],
    ["parent1", "/api/teachers", "Parent cannot list staff records"],
  ]) {
    const res = await api(who, "GET", path);
    const leaked = JSON.stringify(res.json ?? {}).includes("QA Student 05");
    check(label, denied(res.status) || !leaked,
      "denied or no other-family data", `${res.status}${leaked ? " LEAKED" : ""}`, "Critical");
  }

  // ── §23 Unauthenticated ────────────────────────────────────────
  currentModule = "§23 Unauthenticated";
  for (const path of ["/api/students", "/api/teachers", "/api/exams", "/api/classes", "/api/notifications"]) {
    const res = await fetch(`${BASE}${path}`);
    check(`Anonymous request to ${path} is rejected`,
      res.status === 401 || res.status === 403, "401/403", res.status, "Critical");
  }

  // ── §20 Release states ─────────────────────────────────────────
  currentModule = "§23 Staff-only reads";
  {
    // Permanent guard against F-16/F-17/F-18: every roster or campus-admin read
    // must refuse family accounts outright. requireAuthUser() alone is not a
    // gate — these routes are scoped by campus, so any authenticated account
    // would otherwise see the whole school.
    const staffOnly = [
      ["/api/students/parents?search=QA", "guardian contact directory"],
      ["/api/students/siblings?search=QA", "school-wide sibling groups"],
      ["/api/teachers/availability", "staff availability + emails"],
      ["/api/academic-cycle/closure", "year-closure checklist"],
      ["/api/academic/hub-stats", "campus academic statistics"],
      ["/api/academic-year/history", "per-year class history"],
    ];
    for (const [path, what] of staffOnly) {
      for (const who of ["student1", "parent1"]) {
        const res = await api(who, "GET", path);
        check(`${who} cannot read ${what}`,
          res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
      }
    }
    // …and staff must still be able to, so the guard can't be "fixed" by
    // breaking the feature.
    for (const [path, what] of staffOnly) {
      const res = await api("admin", "GET", path);
      check(`admin can still read ${what}`,
        res.status === 200, "200", `${res.status} ${brief(res.json)}`, "High");
    }
  }

  currentModule = "§20 Release states";
  {
    const before = await api("parent1", "GET", "/api/parent/data");
    const cardsBefore = before.json?.data?.reportCards?.length ?? 0;
    check("Family sees no report card while it is only GENERATED",
      cardsBefore === 0, "0 released cards", `${cardsBefore} visible`, "Critical");

    await prisma.reportCard.update({ where: { id: card.id }, data: { status: "PUBLISHED" } });

    const after = await api("parent1", "GET", "/api/parent/data");
    const cardsAfter = after.json?.data?.reportCards?.length ?? 0;
    check("Family sees the report card once PUBLISHED",
      cardsAfter > 0, "at least 1", `${cardsAfter} visible`, "High");
  }
  {
    const res = await api("parent3", "GET", "/api/parent/data");
    const body = JSON.stringify(res.json ?? {});
    check("Parent 3's payload contains none of Parent 1's children",
      !body.includes("QA Student 01") && !body.includes("QA Student 02"),
      "no 5A children", body.includes("QA Student 01") ? "LEAKED student 01" : "clean", "Critical");
  }

  // ── §25 Edge cases ─────────────────────────────────────────────
  currentModule = "§25 Edge cases";
  {
    const res = await api("admin", "POST", "/api/exams", { title: "", term: "", classId: g5a, academicYear: years.y1, examType: "MID_TERM" });
    check("Empty exam title is rejected", res.status === 400, "400", `${res.status} ${brief(res.json)}`, "Medium");
  }
  {
    const res = await api("admin", "POST", "/api/exams", {
      title: "X".repeat(5000), term: "Mid Term", classId: g5a, academicYear: years.y1, examType: "MID_TERM",
    });
    check("A 5000-character title is rejected rather than stored",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "Medium");
  }
  {
    const res = await api("admin", "POST", "/api/exams", {
      title: "QA Bad Class", term: "Mid Term",
      classId: "00000000-0000-0000-0000-000000000000",
      academicYear: years.y1, examType: "MID_TERM",
    });
    check("Exam for a non-existent class is rejected",
      denied(res.status) || res.status === 400, "400/404", `${res.status} ${brief(res.json)}`, "High");
  }
  {
    const res = await api("teacher1", "POST", "/api/marks", {
      examId: exam.id,
      entries: [{ studentId: "00000000-0000-0000-0000-000000000000", subjectId: g5aSubjects[0].id, marksObtained: 50 }],
    });
    check("Marks for a non-existent student are rejected",
      res.status === 400 || denied(res.status), "400/403", `${res.status} ${brief(res.json)}`, "High");
  }
  {
    const res = await api("admin", "POST", "/api/classes", {
      name: "QA Grade 5", section: "A", academicYear: years.y1,
    });
    check("Duplicate class name/section/year is rejected",
      res.status === 409 || res.status === 400, "409/400", `${res.status} ${brief(res.json)}`, "Medium");
  }
  {
    // The rooms route clamps with Math.max(0, …) rather than erroring, so the
    // contract is "never stores a negative", not "rejects the request".
    const res = await api("admin", "POST", "/api/academic/rooms", { roomNumber: "QA-NEG", capacity: -5 });
    const stored = await prisma.classRoom.findFirst({
      where: { roomNumber: "QA-NEG" }, select: { capacity: true },
    });
    check("Negative room capacity never reaches the database",
      !stored || stored.capacity >= 0,
      "capacity >= 0", `stored capacity ${stored?.capacity ?? "(not created)"} (api ${res.status})`, "Medium");
  }
  {
    const res = await api("admin", "POST", "/api/academic-cycle", {
      label: "QA Bad Cycle", academicYear: years.y2,
      startDate: `${years.y2}-06-01`, endDate: `${years.y2}-01-01`,
    });
    check("Academic cycle ending before it starts is rejected",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "Medium");
  }
  {
    // Repeated identical submits must not double-write.
    const body = {
      examId: exam.id,
      entries: [{ studentId: g5aStudents[0].id, subjectId: g5aSubjects[0].id, marksObtained: 61 }],
    };
    await api("admin", "POST", `/api/exams/${exam.id}/reject`, { reason: "reopening for the duplicate-submit check" });
    await Promise.all([api("teacher1", "POST", "/api/marks", body), api("teacher1", "POST", "/api/marks", body)]);
    const count = await prisma.mark.count({
      where: { examId: exam.id, studentId: g5aStudents[0].id, subjectId: g5aSubjects[0].id },
    });
    check("Submitting the same mark twice stores one row",
      count === 1, "1 mark row", `${count} rows`, "High");
  }

  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n${"═".repeat(78)}`);
  console.log(`QA MATRIX 5 — ${pass} passed, ${fail} failed, ${blocked} blocked (${results.length} total)`);
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
  fs.writeFileSync("/tmp/qa-results5.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  // A harness that crashed before asserting anything reports
  // "0 passed, 0 failed" — which reads as success. It is not.
  process.exit(fail > 0 || results.length === 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
