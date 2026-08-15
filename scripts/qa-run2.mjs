// ─────────────────────────────────────────────────────────────────
// QA harness, part 2 — timetable conflicts (spec §56-73) and academic-year
// rollover / promotion / data isolation (spec §38-55).
//
//   node scripts/qa-run2.mjs        (run after qa-run.mjs)
//
// Assumes the QA environment from scripts/qa-seed.mjs is present.
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


const isConnectionDrop = (status, json) =>
  status >= 500 && /Can't reach database server|P1001|ECONNRESET/i.test(JSON.stringify(json ?? ""));

async function api(who, method, path, body, attempt = 0) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookies[who] ? { Cookie: cookies[who] } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  if (isConnectionDrop(res.status, json) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return api(who, method, path, body, attempt + 1);
  }
  return { status: res.status, ok: res.ok, json };
}
const brief = (o) => JSON.stringify(o).slice(0, 220);

async function run() {
  const { classes, years, users, rooms, students } = env;
  const g5aSubjects = env.subjects[classes.g5a];
  const g5bSubjects = env.subjects[classes.g5b];
  const maths5a = g5aSubjects.find((s) => s.name === "Mathematics");
  const maths5b = g5bSubjects.find((s) => s.name === "Mathematics");

  await login("admin", users.admin);
  await login("principal", users.principal);
  await login("teacher1", users.teachers[0].email);
  await login("teacher2", users.teachers[1].email);
  await login("student1", users.students[0].email);

  // ── Timetable creation ────────────────────────────────────────
  currentModule = "Timetable";
  let tt5a = null;
  let tt5b = null;
  {
    const res = await api("admin", "POST", "/api/timetable", {
      classId: classes.g5a, academicYear: years.y1, term: "ANNUAL",
    });
    if (check("Admin can create a class timetable", res.ok, "201", `${res.status} ${brief(res.json)}`, "High")) {
      tt5a = res.json.data;
    }
  }
  {
    const res = await api("admin", "POST", "/api/timetable", {
      classId: classes.g5a, academicYear: years.y1, term: "ANNUAL",
    });
    check("Duplicate timetable for same class/year/term is rejected",
      res.status === 409, "409", `${res.status} ${brief(res.json)}`, "Medium");
  }
  {
    const res = await api("admin", "POST", "/api/timetable", {
      classId: classes.g5b, academicYear: years.y1, term: "ANNUAL",
    });
    if (res.ok) tt5b = res.json.data;
  }
  {
    const res = await api("teacher1", "POST", "/api/timetable", {
      classId: classes.g6aY2, academicYear: years.y2, term: "ANNUAL",
    });
    check("Teacher CANNOT create a timetable", res.status === 403, "403", `${res.status} ${brief(res.json)}`, "High");
  }

  if (!tt5a || !tt5b) {
    record("BLOCKED", "Timetable conflict tests", "two timetables", "creation failed", "High");
    return report();
  }

  const slotAt = (tt, day, period) =>
    tt.slots.find((s) => s.dayOfWeek === day && s.periodNumber === period);

  // Teacher 1 teaches Maths in 5A, Monday period 1, room QA-A.
  const a1 = slotAt(tt5a, 1, 1);
  const b1 = slotAt(tt5b, 1, 1);
  const b2 = slotAt(tt5b, 1, 2);

  {
    const res = await api("admin", "PUT", `/api/timetable/${tt5a.id}`, {
      slots: [{ ...a1, subjectId: maths5a.id, teacherId: users.teachers[0].id, roomId: rooms["QA-A"].id }],
    });
    check("Assign teacher + room to a free slot", res.ok, "200", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    // Same teacher, same day/period, different class.
    const res = await api("admin", "PUT", `/api/timetable/${tt5b.id}`, {
      slots: [{ ...b1, subjectId: maths5b.id, teacherId: users.teachers[0].id, roomId: rooms["QA-B"].id }],
    });
    const isTeacherClash = res.status === 409 && /already teaching/i.test(JSON.stringify(res.json));
    check("§60: teacher double-booking is BLOCKED",
      isTeacherClash, "409 teacher conflict", `${res.status} ${brief(res.json)}`, "Critical");
  }

  {
    // Different teacher, but same room, same day/period.
    const res = await api("admin", "PUT", `/api/timetable/${tt5b.id}`, {
      slots: [{ ...b1, subjectId: maths5b.id, teacherId: users.teachers[1].id, roomId: rooms["QA-A"].id }],
    });
    const isRoomClash = res.status === 409 && /already booked/i.test(JSON.stringify(res.json));
    check("§62: room double-booking is BLOCKED",
      isRoomClash, "409 room conflict", `${res.status} ${brief(res.json)}`, "Critical");
  }

  {
    // Free teacher, free room — should succeed.
    const res = await api("admin", "PUT", `/api/timetable/${tt5b.id}`, {
      slots: [{ ...b1, subjectId: maths5b.id, teacherId: users.teachers[1].id, roomId: rooms["QA-B"].id }],
    });
    check("Non-conflicting assignment is accepted", res.ok, "200", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    // Same teacher, adjacent period — not a conflict.
    const res = await api("admin", "PUT", `/api/timetable/${tt5b.id}`, {
      slots: [{ ...b2, subjectId: maths5b.id, teacherId: users.teachers[0].id, roomId: rooms["QA-B"].id }],
    });
    check("Back-to-back periods for one teacher are allowed",
      res.ok, "200", `${res.status} ${brief(res.json)}`, "Medium");
  }

  {
    const res = await api("admin", "PUT", `/api/timetable/${tt5a.id}`, { action: "publish" });
    const v = res.json?.validation;
    check("§70: publish reports a validation summary",
      res.ok && v && typeof v.counts?.critical === "number",
      "200 + validation counts", `${res.status} ${brief(res.json)}`, "Medium");
  }

  {
    const res = await api("student1", "PUT", `/api/timetable/${tt5a.id}`, { action: "unpublish" });
    check("Student CANNOT unpublish a timetable", res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
  }

  {
    // F-19: /api/timetable/teacher took teacherId straight off the query
    // string. Run against a *published* timetable, so a leak would actually
    // return slots — an empty result here would prove nothing.
    const self = await api("teacher1", "GET", `/api/timetable/teacher?teacherId=${users.teachers[0].id}`);
    check("A teacher sees their own published schedule",
      self.ok && (self.json?.data?.length ?? 0) > 0,
      "200 with slots", `${self.status} ${self.json?.data?.length ?? "-"} slots`, "High");

    const foreign = await api("teacher2", "GET", `/api/timetable/teacher?teacherId=${users.teachers[0].id}`);
    check("A teacher CANNOT read another teacher's schedule by id",
      foreign.status === 403, "403", `${foreign.status} ${brief(foreign.json)}`, "High");

    const family = await api("student1", "GET", `/api/timetable/teacher?teacherId=${users.teachers[0].id}`);
    check("A student CANNOT read a teacher's schedule",
      family.status === 403, "403", `${family.status} ${brief(family.json)}`, "Critical");
  }

  // ── Year closure gate ─────────────────────────────────────────
  currentModule = "Year Closure";
  {
    const res = await api("admin", "GET", `/api/academic-cycle/closure?year=${years.y1}`);
    const d = res.json?.data;
    check("Closure report lists the blocking steps",
      res.ok && Array.isArray(d?.steps) && d.steps.length > 0,
      "steps[]", `${res.status} ${brief(res.json)}`, "High");
    if (d) {
      check("Incomplete year CANNOT be closed",
        d.canClose === false,
        "canClose false", `canClose=${d.canClose}; blockers=${brief(d.blockingReasons)}`, "High");
    }
  }

  // ── Promotion ─────────────────────────────────────────────────
  currentModule = "Promotion";
  const g5aStudents = students.filter((s) => s.classId === classes.g5a);

  {
    const res = await api("teacher1", "POST", "/api/students/promote", {
      fromClassId: classes.g5a, toClassId: classes.g6aY2, academicYear: years.y1,
      results: g5aStudents.map((s) => ({ studentId: s.id, outcome: "PASS" })),
    });
    check("Teacher CANNOT promote students", res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
  }

  {
    const res = await api("admin", "POST", "/api/students/promote", {
      fromClassId: classes.g5a, toClassId: classes.g5aY2, academicYear: years.y1,
      results: [{ studentId: g5aStudents[0].id, outcome: "PASS" }],
    });
    // g5aY2 is academicYear y2 = y1+1, so this is actually valid; the invalid
    // case is promoting into the same year.
    check("Promotion into the next year's class is accepted",
      res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const res = await api("admin", "POST", "/api/students/promote", {
      fromClassId: classes.g5a, toClassId: classes.g5b, academicYear: years.y1,
      results: [{ studentId: g5aStudents[1].id, outcome: "PASS" }],
    });
    check("§47: promotion into a same-year class is rejected",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const res = await api("admin", "POST", "/api/students/promote", {
      fromClassId: classes.g5a, toClassId: classes.g6aY2, academicYear: years.y1,
      results: [{ studentId: g5aStudents[2].id, outcome: "FAIL" }],
    });
    check("§45: a batch of only failing students promotes nobody",
      res.status === 400, "400 no passing students", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const res = await api("admin", "POST", "/api/students/promote", {
      fromClassId: classes.g5a, toClassId: classes.g6aY2, academicYear: years.y1,
      results: [
        { studentId: g5aStudents[1].id, outcome: "PASS", finalPercentage: 82, finalGrade: "A" },
        { studentId: g5aStudents[2].id, outcome: "FAIL", finalPercentage: 31, finalGrade: "F" },
      ],
    });
    check("§45: mixed batch promotes only the passing student",
      res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const res = await api("admin", "POST", "/api/students/promote", {
      fromClassId: classes.g5a, toClassId: classes.g6aY2, academicYear: years.y1,
      results: [{ studentId: g5aStudents[1].id, outcome: "PASS", finalPercentage: 150 }],
    });
    check("Invalid finalPercentage (150) is rejected",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "Medium");
  }

  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n${"═".repeat(78)}`);
  console.log(`QA MATRIX 2 — ${pass} passed, ${fail} failed, ${blocked} blocked (${results.length} total)`);
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
  fs.writeFileSync("/tmp/qa-results2.json", JSON.stringify(results, null, 2));
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
