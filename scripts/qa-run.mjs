// ─────────────────────────────────────────────────────────────────
// QA lifecycle + permission harness.
//
//   node scripts/qa-seed.mjs && node scripts/qa-run.mjs
//
// Drives the real HTTP API with real login cookies, so backend authorization is
// exercised directly rather than through whatever the UI happens to render.
// A hidden button is not security; these calls do not care what is hidden.
//
// Prints a test matrix and exits non-zero if anything failed.
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const env = JSON.parse(fs.readFileSync("/tmp/qa-env.json", "utf8"));

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

  // A 5xx here is the connection pool, not the product. Without this retry a
  // single pool timeout costs the login AND silently 401s every later call
  // that role would have made — which is what turned one infra blip into 35
  // bogus failures.
  if (!token && res.status >= 500 && attempt < 5) {
    const wait = 3000 * (attempt + 1);
    console.log(`      \x1b[33m↻ login ${email} got ${res.status}, retry ${attempt + 1}/5 in ${wait}ms\x1b[0m`);
    await new Promise((r) => setTimeout(r, wait));
    return login(key, email, attempt + 1);
  }
  if (!token) throw new Error(`login failed for ${email}: ${res.status}`);
  cookies[key] = token;
  return token;
}


// The Supabase pooler drops connections intermittently. A P1001 is an
// environment failure, not a product result, so retry it rather than record a
// false FAIL — but only for connection errors, never for real 4xx/5xx logic.
const isConnectionDrop = (status, json) =>
  status >= 500 && /Can't reach database server|P1001|ECONNRESET/i.test(JSON.stringify(json ?? ""));

async function api(who, method, path, body, attempt = 0) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookies[who] ? { Cookie: cookies[who] } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }

  if (isConnectionDrop(res.status, json) && attempt < 4) {
    const wait = 1500 * (attempt + 1);
    console.log(`      \x1b[33m↻ db connection dropped on ${method} ${path}, retry ${attempt + 1}/4 in ${wait}ms\x1b[0m`);
    await new Promise((r) => setTimeout(r, wait));
    return api(who, method, path, body, attempt + 1);
  }
  return { status: res.status, ok: res.ok, json };
}

const brief = (o) => JSON.stringify(o).slice(0, 220);

// ─────────────────────────────────────────────────────────────────

async function run() {
  const { classes, students, rooms, examPeriods, years, users } = env;
  const g5aSubjects = env.subjects[classes.g5a];
  const maths = g5aSubjects.find((s) => s.name === "Mathematics");
  const english = g5aSubjects.find((s) => s.name === "English");
  const science = g5aSubjects.find((s) => s.name === "Science");
  const g5aStudents = students.filter((s) => s.classId === classes.g5a);
  const g5bStudents = students.filter((s) => s.classId === classes.g5b);

  // ── Authentication ────────────────────────────────────────────
  currentModule = "Auth";
  for (const [key, email] of [
    ["admin", users.admin],
    ["principal", users.principal],
    ["teacher1", users.teachers[0].email],
    ["teacher2", users.teachers[1].email],
    ["parent1", users.parents[0].email],
    ["parent3", users.parents[2].email],
    ["student1", users.students[0].email],
    ["student5", users.students[4].email],
  ]) {
    try {
      await login(key, email);
      record("PASS", `Login as ${key} (${email})`, "200 + session cookie", "200 + session cookie");
    } catch (e) {
      record("FAIL", `Login as ${key} (${email})`, "200 + session cookie", e.message, "Critical");
    }
  }

  const r = await api("admin", "POST", "/api/auth/login", { email: users.admin, password: "wrong-password" });
  check("Login with wrong password is rejected", r.status === 401, "401", r.status, "Critical");

  const anon = await fetch(`${BASE}/api/students`);
  check("Unauthenticated /api/students is rejected", anon.status === 401 || anon.status === 403,
    "401/403", anon.status, "Critical");

  // ── Exam creation (E3 regression) ─────────────────────────────
  currentModule = "Exams";
  let midTerm = null;
  {
    const res = await api("admin", "POST", "/api/exams", {
      title: "QA Mid Term",
      term: "Mid Term",
      classId: classes.g5a,
      academicYear: years.y1,
      examType: "MID_TERM",
    });
    if (check("Campus admin can create a MID_TERM exam", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High")) {
      midTerm = res.json.exam;
    }
  }

  {
    const res = await api("teacher1", "POST", "/api/exams", {
      title: "QA Teacher Mid Term Attempt",
      term: "Mid Term",
      classId: classes.g5a,
      academicYear: years.y1,
      examType: "MID_TERM",
    });
    check("Teacher CANNOT create a term exam", res.status === 403, "403", `${res.status} ${brief(res.json)}`, "High");
  }

  if (!midTerm) {
    record("BLOCKED", "Remaining exam-flow tests", "exam created", "no exam to work with", "Critical");
    return report();
  }

  // ── Date sheet: E3 + E2 + clash rules ─────────────────────────
  currentModule = "Exam Schedule";
  const ds = (who, body) => api(who, "POST", "/api/academic/exam-schedule", body);

  // Pick a weekday that is not Sunday.
  const dayA = `${years.y1}-11-10`; // Monday
  const dayB = `${years.y1}-11-11`;
  const sunday = `${years.y1}-11-09`;

  {
    const res = await ds("admin", {
      examId: midTerm.id, subjectId: maths.id, date: dayA,
      periodDefinitionId: examPeriods[0], roomId: rooms["QA-C"].id,
    });
    check("E3: campus ADMIN can create a date-sheet entry", res.ok, "201", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const res = await ds("admin", {
      examId: midTerm.id, subjectId: english.id, date: dayA,
      periodDefinitionId: examPeriods[0], roomId: rooms["QA-C"].id,
    });
    check("Class cannot sit two papers in one slot",
      res.status === 409, "409 clash", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const res = await ds("admin", {
      examId: midTerm.id, subjectId: english.id, date: sunday,
      periodDefinitionId: examPeriods[0], roomId: rooms["QA-C"].id,
    });
    check("Exam cannot be scheduled on a campus weekend",
      res.status === 409, "409 weekend", `${res.status} ${brief(res.json)}`, "Medium");
  }

  {
    // 4 students in 5A vs QA-TINY capacity 2 — the E2 fix.
    const res = await ds("admin", {
      examId: midTerm.id, subjectId: english.id, date: dayB,
      periodDefinitionId: examPeriods[0], roomId: rooms["QA-TINY"].id,
    });
    const isCapacity = res.status === 409 && /capacity/i.test(JSON.stringify(res.json));
    check("E2: over-capacity exam room is BLOCKED",
      isCapacity, "409 capacity conflict", `${res.status} ${brief(res.json)}`, "Critical");
  }

  {
    const res = await ds("admin", {
      examId: midTerm.id, subjectId: english.id, date: dayB,
      periodDefinitionId: examPeriods[0], roomId: rooms["QA-C"].id,
    });
    check("Same subject on a different day is accepted", res.ok, "201", `${res.status} ${brief(res.json)}`, "Medium");
  }

  {
    const res = await ds("admin", {
      examId: midTerm.id, subjectId: maths.id, date: dayB,
      periodDefinitionId: examPeriods[1], roomId: rooms["QA-C"].id,
    });
    check("Duplicate subject in same exam is rejected",
      res.status === 409, "409 duplicate", `${res.status} ${brief(res.json)}`, "Medium");
  }

  {
    const res = await ds("teacher1", {
      examId: midTerm.id, subjectId: science.id, date: dayB,
      periodDefinitionId: examPeriods[1], roomId: rooms["QA-C"].id,
    });
    check("Teacher CANNOT create date-sheet entries",
      res.status === 403, "403", `${res.status} ${brief(res.json)}`, "High");
  }

  // ── Marks ─────────────────────────────────────────────────────
  currentModule = "Marks";
  await api("admin", "PATCH", "/api/exams", { id: midTerm.id, status: "ACTIVE" });

  {
    const res = await api("teacher1", "POST", "/api/marks", {
      examId: midTerm.id,
      entries: [{ studentId: g5aStudents[0].id, subjectId: maths.id, marksObtained: 150 }],
    });
    check("Marks above subject total are rejected",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const res = await api("teacher1", "POST", "/api/marks", {
      examId: midTerm.id,
      entries: [{ studentId: g5aStudents[0].id, subjectId: maths.id, marksObtained: -5 }],
    });
    check("Negative marks are rejected",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    // Teacher 2 owns English/Urdu, not Mathematics.
    const res = await api("teacher2", "POST", "/api/marks", {
      examId: midTerm.id,
      entries: [{ studentId: g5aStudents[0].id, subjectId: maths.id, marksObtained: 50 }],
    });
    check("Teacher cannot mark another teacher's subject",
      res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
  }

  {
    const res = await api("teacher1", "POST", "/api/marks", {
      examId: midTerm.id,
      entries: [{ studentId: g5bStudents[0].id, subjectId: maths.id, marksObtained: 50 }],
    });
    check("Marks for a student outside the exam class are rejected",
      res.status === 400 || res.status === 403, "400/403", `${res.status} ${brief(res.json)}`, "Critical");
  }

  {
    const res = await api("student1", "POST", "/api/marks", {
      examId: midTerm.id,
      entries: [{ studentId: g5aStudents[0].id, subjectId: maths.id, marksObtained: 100 }],
    });
    check("Student CANNOT enter their own marks",
      res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
  }

  // Boundary values, entered legitimately by the owning teachers.
  currentModule = "Marks (boundaries)";
  const boundary = [
    [g5aStudents[0].id, 100, "full marks"],
    [g5aStudents[1].id, 50, "exactly passing"],
    [g5aStudents[2].id, 49, "just below passing"],
    [g5aStudents[3].id, 0, "zero"],
  ];
  for (const [studentId, marks, label] of boundary) {
    const res = await api("teacher1", "POST", "/api/marks", {
      examId: midTerm.id,
      entries: [{ studentId, subjectId: maths.id, marksObtained: marks }],
    });
    check(`Maths ${label} (${marks}/100) accepted`, res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
  }

  // Fill every remaining subject so the exam can lock.
  const teacherFor = { Mathematics: "teacher1", "Computer Science": "teacher1", English: "teacher2", Urdu: "teacher2", Science: "teacher3" };
  await login("teacher3", users.teachers[2].email);
  for (const subj of g5aSubjects) {
    if (subj.name === "Mathematics") continue;
    const who = teacherFor[subj.name];
    const entries = g5aStudents.map((s, i) => ({
      studentId: s.id,
      subjectId: subj.id,
      marksObtained: Math.round(subj.totalMarks * [1, 0.5, 0.49, 0][i % 4]),
    }));
    const res = await api(who, "POST", "/api/marks", { examId: midTerm.id, entries });
    check(`Bulk marks entered for ${subj.name}`, res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
  }

  // ── Lock + reject workflow (E4) ───────────────────────────────
  currentModule = "Marks Approval";
  {
    const res = await api("teacher1", "POST", `/api/exams/${midTerm.id}/lock`, {});
    check("Teacher CANNOT lock an exam", res.status === 403, "403", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const res = await api("principal", "POST", `/api/exams/${midTerm.id}/lock`, {});
    check("Principal can lock the exam and generate report cards",
      res.ok && res.json?.reportCardsGenerated > 0,
      "2xx + report cards", `${res.status} ${brief(res.json)}`, "Critical");
  }

  {
    const res = await api("teacher1", "POST", "/api/marks", {
      examId: midTerm.id,
      entries: [{ studentId: g5aStudents[0].id, subjectId: maths.id, marksObtained: 10 }],
    });
    check("Marks are frozen once the exam is locked",
      res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
  }

  {
    const res = await api("teacher1", "POST", `/api/exams/${midTerm.id}/reject`, { reason: "Maths totals look wrong" });
    check("E4: teacher CANNOT reject marks", res.status === 403, "403", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const res = await api("principal", "POST", `/api/exams/${midTerm.id}/reject`, { reason: "bad" });
    check("E4: rejection without a real reason is refused",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "Medium");
  }

  {
    const res = await api("principal", "POST", `/api/exams/${midTerm.id}/reject`, {
      reason: "Mathematics totals need re-checking against the answer sheets.",
    });
    check("E4: principal can send marks back to the teacher",
      res.ok && res.json?.exam?.status === "MARKS_ENTRY",
      "2xx + status MARKS_ENTRY", `${res.status} ${brief(res.json)}`, "High");

    // Once rejected the exam is unlocked, so GET /api/reports correctly 409s
    // ("only locked exams") rather than returning an empty list — the actual
    // withdrawal signal is the reject response's own _count.reportCards.
    const count = res.json?.exam?._count?.reportCards;
    check("E4: rejection withdraws the generated report cards",
      res.ok && count === 0, "_count.reportCards === 0", `${res.status} count=${count} (${brief(res.json)})`, "Critical");
  }

  {
    const res = await api("teacher1", "POST", "/api/marks", {
      examId: midTerm.id,
      entries: [{ studentId: g5aStudents[0].id, subjectId: maths.id, marksObtained: 95 }],
    });
    check("E4: teacher can correct marks after rejection", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const res = await api("principal", "POST", `/api/exams/${midTerm.id}/lock`, {});
    check("E4: exam can be re-locked after correction", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
  }

  // ── Family data isolation ─────────────────────────────────────
  currentModule = "Data Isolation";
  {
    const res = await api("parent1", "GET", "/api/parent/data");
    const body = JSON.stringify(res.json);
    const seesOwn = body.includes("QA Student 01");
    const seesOther = body.includes("QA Student 05") || body.includes("QA Student 06");
    check("Parent 01 sees their own child", seesOwn, "QA Student 01 present", seesOwn ? "present" : "absent", "High");
    check("Parent 01 CANNOT see another parent's children",
      !seesOther, "students 05/06 absent", seesOther ? "LEAKED" : "absent", "Critical");
  }

  {
    const res = await api("student5", "GET", `/api/academic/exam-schedule?examId=${midTerm.id}`);
    const rows = Array.isArray(res.json?.data) ? res.json.data : [];
    check("Student in 5B cannot read 5A's date sheet",
      rows.length === 0, "0 rows", `${rows.length} rows`, "Critical");
  }

  {
    const res = await api("student1", "GET", "/api/students");
    const body = JSON.stringify(res.json);
    const leaked = body.includes("QA Student 05");
    check("Student cannot list other classes' students via /api/students",
      res.status === 403 || !leaked, "403 or no leak", leaked ? `LEAKED ${res.status}` : `ok ${res.status}`, "Critical");
  }

  {
    const res = await api("parent1", "POST", "/api/marks", {
      examId: midTerm.id,
      entries: [{ studentId: g5aStudents[0].id, subjectId: maths.id, marksObtained: 100 }],
    });
    check("Parent CANNOT enter marks", res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
  }

  {
    const res = await api("teacher1", "POST", "/api/grade-config", {
      classId: classes.g5a, academicYear: years.y1, passingPercentage: 0,
    });
    check("E11: teacher CANNOT rewrite the passing percentage",
      res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
  }

  {
    const res = await api("student1", "POST", "/api/grade-config", {
      classId: classes.g5a, academicYear: years.y1, passingPercentage: 0,
    });
    check("E11: student CANNOT rewrite the passing percentage",
      res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
  }

  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;

  console.log(`\n${"═".repeat(78)}`);
  console.log(`QA MATRIX — ${pass} passed, ${fail} failed, ${blocked} blocked (${results.length} total)`);
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

  fs.writeFileSync("/tmp/qa-results.json", JSON.stringify(results, null, 2));
  console.log(`\nwritten /tmp/qa-results.json`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
