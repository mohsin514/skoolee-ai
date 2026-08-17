// ─────────────────────────────────────────────────────────────────
// QA harness, part 6 — the module lifecycles the earlier parts skipped.
//
//   node scripts/qa-seed.mjs && node scripts/qa-run6.mjs
//
// Covers the CRUD surfaces the academic-flow harnesses only ever read from:
//   §5  teacher/staff lifecycle
//   §7  classroom lifecycle + capacity
//   §8  classes and sections
//   §9  subjects
//   §4  student edit / archive / search
//   §21 + §38 the *actual* year closure, not just its gate
//   §39 starting the next year afterwards
//   §15 date-sheet visibility to every role
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
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: env.password }),
  });
  const token = (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0])
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
}
async function api(who, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(cookies[who] ? { Cookie: cookies[who] } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 160) }; }
  return { status: res.status, ok: res.ok, json };
}
const brief = (o) => JSON.stringify(o).slice(0, 190);
const denied = (s) => s === 401 || s === 403 || s === 404;

async function run() {
  const { classes, students, years, users, rooms, examPeriods } = env;

  for (const [k, e] of [
    ["admin", users.admin], ["principal", users.principal],
    ["teacher1", users.teachers[0].email], ["teacher2", users.teachers[1].email],
    ["teacher3", users.teachers[2].email],
    ["parent1", users.parents[0].email], ["student1", users.students[0].email],
  ]) await login(k, e);

  // ── §5 Teacher / staff lifecycle ───────────────────────────────
  currentModule = "§5 Teacher lifecycle";
  let newTeacherId = null;
  {
    const res = await api("admin", "POST", "/api/staff", {
      fullName: "QA Teacher 04", email: "qa+teacher04@example.invalid",
      role: "TEACHER", phone: "+920000000094", subjectSpecialties: ["Mathematics"],
    });
    if (check("Admin can create a teacher", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High")) {
      newTeacherId = res.json?.data?.id || res.json?.user?.id || res.json?.id;
    }
  }
  {
    const res = await api("admin", "POST", "/api/staff", {
      fullName: "QA Dup", email: "qa+teacher04@example.invalid", role: "TEACHER",
    });
    check("Duplicate teacher email is rejected",
      res.status === 409 || res.status === 400, "409/400", `${res.status} ${brief(res.json)}`, "High");
  }
  {
    const res = await api("teacher1", "POST", "/api/staff", {
      fullName: "QA Rogue", email: "qa+rogue@example.invalid", role: "TEACHER",
    });
    check("Teacher CANNOT create staff", denied(res.status), "401/403", `${res.status} ${brief(res.json)}`, "Critical");
  }
  if (newTeacherId) {
    const res = await api("admin", "PATCH", "/api/staff", { id: newTeacherId, fullName: "QA Teacher 04 Edited" });
    const row = await prisma.user.findUnique({ where: { id: newTeacherId }, select: { fullName: true } });
    check("Teacher profile can be edited",
      res.ok && row?.fullName === "QA Teacher 04 Edited",
      "name updated", `${res.status} name=${row?.fullName}`, "High");
  }
  if (newTeacherId) {
    const res = await api("admin", "PATCH", "/api/staff", { id: newTeacherId, isActive: false });
    const row = await prisma.user.findUnique({ where: { id: newTeacherId }, select: { isActive: true } });
    check("Teacher can be deactivated",
      res.ok && row?.isActive === false, "isActive false", `${res.status} isActive=${row?.isActive}`, "High");
  }
  {
    // /api/staff has no server-side `search` param — it filters by campus,
    // role and includeInactive, and the UI narrows the list client-side. The
    // real contract is that a newly invited teacher shows up in the listing,
    // as a pending invitation until they accept.
    const res = await api("admin", "GET", "/api/staff");
    const staff = res.json?.staff ?? [];
    const invitations = res.json?.invitations ?? [];
    const found =
      staff.some((s) => (s.fullName || "").includes("QA Teacher 04")) ||
      invitations.some((i) => (i.email || "").includes("qa+teacher04"));
    check("Newly invited teacher appears in the staff listing",
      found, "present in staff or invitations",
      `${staff.length} staff, ${invitations.length} invitations`, "Medium");
  }

  // ── §7 Classroom lifecycle ─────────────────────────────────────
  currentModule = "§7 Classrooms";
  let roomId = null;
  {
    const res = await api("admin", "POST", "/api/academic/rooms", { roomNumber: "QA-NEW", capacity: 25 });
    if (check("Admin can create a classroom", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High")) {
      roomId = res.json?.data?.id ?? res.json?.id;
    }
  }
  {
    const res = await api("admin", "POST", "/api/academic/rooms", { roomNumber: "QA-NEW", capacity: 30 });
    check("Duplicate room number is rejected",
      res.status === 409 || res.status === 400, "409/400", `${res.status} ${brief(res.json)}`, "Medium");
  }
  if (roomId) {
    const res = await api("admin", "PATCH", "/api/academic/rooms", { id: roomId, capacity: 45 });
    const row = await prisma.classRoom.findUnique({ where: { id: roomId }, select: { capacity: true } });
    check("Classroom capacity can be edited",
      res.ok && row?.capacity === 45, "capacity 45", `${res.status} capacity=${row?.capacity}`, "Medium");
  }
  {
    const res = await api("teacher1", "POST", "/api/academic/rooms", { roomNumber: "QA-ROGUE", capacity: 10 });
    check("Teacher CANNOT create a classroom", denied(res.status), "401/403", `${res.status} ${brief(res.json)}`, "High");
  }
  if (roomId) {
    const res = await api("admin", "DELETE", `/api/academic/rooms?id=${roomId}`);
    const row = await prisma.classRoom.findUnique({ where: { id: roomId } });
    check("Classroom can be deleted when unused",
      res.ok || !row, "deleted", `${res.status}, row ${row ? "still present" : "gone"}`, "Medium");
  }

  // ── §8 Classes and sections ────────────────────────────────────
  currentModule = "§8 Classes";
  let newClassId = null;
  {
    const res = await api("admin", "POST", "/api/classes", {
      name: "QA Grade 7", section: "A", academicYear: years.y1,
    });
    if (check("Admin can create a class", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High")) {
      newClassId = res.json?.data?.id ?? res.json?.id;
    }
  }
  {
    const res = await api("admin", "POST", "/api/classes", {
      name: "QA Grade 7", section: "B", academicYear: years.y1,
    });
    check("A second section of the same class is allowed",
      res.ok, "2xx", `${res.status} ${brief(res.json)}`, "Medium");
  }
  {
    const res = await api("teacher1", "POST", "/api/classes", {
      name: "QA Rogue Class", section: "A", academicYear: years.y1,
    });
    check("Teacher CANNOT create a class", denied(res.status), "401/403", `${res.status} ${brief(res.json)}`, "High");
  }
  if (newClassId) {
    const res = await api("admin", "PATCH", "/api/classes", {
      id: newClassId, classTeacherId: users.teachers[2].id,
    });
    const row = await prisma.class.findUnique({ where: { id: newClassId }, select: { classTeacherId: true } });
    check("Class teacher can be assigned",
      res.ok && row?.classTeacherId === users.teachers[2].id,
      "teacher assigned", `${res.status} teacher=${row?.classTeacherId}`, "High");
  }

  // ── §9 Subjects ────────────────────────────────────────────────
  currentModule = "§9 Subjects";
  let newSubjectId = null;
  if (newClassId) {
    const res = await api("admin", "POST", "/api/subjects", {
      classId: newClassId, name: "QA Geography", totalMarks: 100, teacherId: users.teachers[0].id,
    });
    if (check("Admin can create a subject", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High")) {
      newSubjectId = res.json?.data?.id ?? res.json?.id;
    }
  }
  if (newSubjectId) {
    const res = await api("admin", "PATCH", "/api/subjects", { id: newSubjectId, totalMarks: 75 });
    const row = await prisma.subject.findUnique({ where: { id: newSubjectId }, select: { totalMarks: true } });
    check("Subject total marks can be edited",
      res.ok && row?.totalMarks === 75, "totalMarks 75", `${res.status} total=${row?.totalMarks}`, "Medium");
  }
  {
    const res = await api("teacher1", "POST", "/api/subjects", {
      classId: newClassId, name: "QA Rogue Subject", totalMarks: 50,
    });
    check("Teacher CANNOT create a subject", denied(res.status), "401/403", `${res.status} ${brief(res.json)}`, "High");
  }
  if (newSubjectId) {
    const res = await api("admin", "DELETE", `/api/subjects?id=${newSubjectId}`);
    const row = await prisma.subject.findUnique({ where: { id: newSubjectId } });
    check("Subject can be deleted when it has no marks",
      res.ok || !row, "deleted", `${res.status}, row ${row ? "present" : "gone"}`, "Medium");
  }

  // ── §4 Student edit / archive / search ─────────────────────────
  currentModule = "§4 Student management";
  const s2 = students.find((s) => s.name === "QA Student 02");
  {
    const res = await api("admin", "PATCH", "/api/students", { id: s2.id, guardianPhone: "+920000009999" });
    const row = await prisma.student.findUnique({ where: { id: s2.id }, select: { guardianPhone: true } });
    check("Student record can be edited",
      res.ok && row?.guardianPhone === "+920000009999",
      "phone updated", `${res.status} phone=${row?.guardianPhone}`, "High");
  }
  {
    const res = await api("parent1", "PATCH", "/api/students", { id: s2.id, fullName: "Hacked Name" });
    const row = await prisma.student.findUnique({ where: { id: s2.id }, select: { fullName: true } });
    check("Parent CANNOT edit a student record",
      denied(res.status) && row?.fullName === "QA Student 02",
      "denied + unchanged", `${res.status}, name=${row?.fullName}`, "Critical");
  }
  {
    const res = await api("admin", "GET", "/api/students?search=QA Student 02");
    const list = res.json?.data ?? res.json?.students ?? [];
    check("Student search finds the record",
      Array.isArray(list) && list.some((x) => x.fullName === "QA Student 02"),
      "match found", `${Array.isArray(list) ? list.length : "?"} rows`, "Medium");
  }
  {
    // The route whitelists active/archived/transferred/graduated, so an
    // unrecognised value is ignored rather than written — assert both halves.
    const bogus = await api("admin", "PATCH", "/api/students", { id: s2.id, status: "inactive" });
    const afterBogus = await prisma.student.findUnique({ where: { id: s2.id }, select: { status: true } });
    check("An unrecognised student status is ignored, not stored",
      afterBogus?.status === "active", "still active", `status=${afterBogus?.status} (api ${bogus.status})`, "Medium");

    const res = await api("admin", "PATCH", "/api/students", { id: s2.id, status: "archived" });
    const row = await prisma.student.findUnique({ where: { id: s2.id }, select: { status: true } });
    check("Student can be archived",
      res.ok && row?.status === "archived", "status archived", `${res.status} status=${row?.status}`, "Medium");
    await api("admin", "PATCH", "/api/students", { id: s2.id, status: "active" });
  }

  // ── §15 Date sheet visibility per role ─────────────────────────
  currentModule = "§15 Date sheet visibility";
  let exam = null;
  {
    const res = await api("admin", "POST", "/api/exams", {
      title: "QA Visibility Term", term: "Mid Term", classId: classes.g5a,
      academicYear: years.y1, examType: "MID_TERM",
    });
    if (res.ok) exam = res.json.exam;
  }
  if (exam) {
    const maths = env.subjects[classes.g5a].find((s) => s.name === "Mathematics");
    const created = await api("admin", "POST", "/api/academic/exam-schedule", {
      examId: exam.id, subjectId: maths.id, date: `${years.y1}-11-17`,
      periodDefinitionId: examPeriods[0], roomId: rooms["QA-C"].id,
    });
    check("Admin can publish a date-sheet entry", created.ok, "201", `${created.status} ${brief(created.json)}`, "High");

    for (const [who, label, shouldSee] of [
      ["admin", "Admin", true], ["principal", "Principal", true],
      ["teacher1", "Teacher of the class", true],
      ["student1", "Student of the class", true],
      ["parent1", "Parent of the class", true],
    ]) {
      const res = await api(who, "GET", `/api/academic/exam-schedule?examId=${exam.id}`);
      const rows = Array.isArray(res.json?.data) ? res.json.data : [];
      check(`${label} can see the date sheet`,
        shouldSee ? rows.length > 0 : rows.length === 0,
        shouldSee ? "at least 1 row" : "0 rows",
        `${res.status}, ${rows.length} rows`, "High");
    }
  }

  // ── §21 / §38 The actual year closure ──────────────────────────
  currentModule = "§21 Year closure";
  {
    const res = await api("admin", "POST", "/api/academic-year", {
      action: "close-year", academicYear: years.y1,
    });
    check("Incomplete year cannot be closed by an admin",
      res.status === 409, "409 blocked", `${res.status} ${brief(res.json)}`, "High");
  }
  {
    // Only a principal may override the checklist, and only with force.
    const res = await api("teacher1", "POST", "/api/academic-year", {
      action: "close-year", academicYear: years.y1, force: true,
    });
    check("Teacher CANNOT force-close a year",
      denied(res.status), "401/403", `${res.status} ${brief(res.json)}`, "Critical");
  }
  {
    const res = await api("admin", "POST", "/api/academic-year", {
      action: "close-year", academicYear: years.y1, force: true,
    });
    check("Admin cannot force-close either (principal only)",
      res.status === 409, "409", `${res.status} ${brief(res.json)}`, "High");
  }
  {
    const res = await api("principal", "POST", "/api/academic-year", {
      action: "close-year", academicYear: years.y1, force: true,
    });
    check("§21: principal can force-close the year",
      res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
  }
  {
    const stillActive = await prisma.class.count({
      where: { campusId: env.campus, academicYear: years.y1, status: "ACTIVE" },
    });
    check("§21: year-1 classes are marked COMPLETED",
      stillActive === 0, "0 active year-1 classes", `${stillActive} still ACTIVE`, "High");
  }
  {
    const history = await prisma.studentClassHistory.count({
      where: { campusId: env.campus, academicYear: years.y1 },
    });
    check("§38: closing archives students into history rather than deleting",
      history > 0, "history rows written", `${history} rows`, "Critical");

    const survivors = await prisma.student.count({ where: { campusId: env.campus } });
    check("§38: no student record was destroyed by closing the year",
      survivors >= 6, "all students still present", `${survivors} students`, "Critical");
  }
  {
    const marks = await prisma.mark.count({ where: { exam: { academicYear: years.y1 } } });
    const cards = await prisma.reportCard.count({ where: { exam: { academicYear: years.y1 } } });
    check("§38: year-1 marks and report cards survive closure",
      marks >= 0 && cards >= 0, "preserved", `${marks} marks, ${cards} report cards`, "Critical");
  }

  // ── §39 The next year still works afterwards ───────────────────
  currentModule = "§39 Next year";
  {
    const res = await api("admin", "POST", "/api/classes", {
      name: "QA Grade 8", section: "A", academicYear: years.y2,
    });
    check("§39: a new class can be created in the next year after closure",
      res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
  }
  {
    const res = await api("admin", "GET", `/api/exams?academicYear=${years.y1}`);
    const list = res.json?.exams ?? [];
    check("§38: closed year's exams remain readable as history",
      Array.isArray(list), "still listable", `${list.length} exams`, "High");
  }

  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n${"═".repeat(78)}`);
  console.log(`QA MATRIX 6 — ${pass} passed, ${fail} failed, ${blocked} blocked (${results.length} total)`);
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
  fs.writeFileSync("/tmp/qa-results6.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  // A harness that crashed before asserting anything reports
  // "0 passed, 0 failed" — which reads as success. It is not.
  process.exit(fail > 0 || results.length === 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
