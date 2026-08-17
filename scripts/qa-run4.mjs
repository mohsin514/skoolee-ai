// ─────────────────────────────────────────────────────────────────
// QA harness, part 4 — notification delivery (spec §28).
//
//   node scripts/qa-seed.mjs && node scripts/qa-run4.mjs
//
// A notification system fails in two directions: it can drop a message the
// right person needed, or deliver one to somebody who should never have seen
// it. Both are tested here per-recipient, against the real inbox each role
// reads, rather than by asserting the event fired.
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
const brief = (o) => JSON.stringify(o).slice(0, 200);

/** notify() is fire-and-forget, so give the write a moment to land. */
const settle = () => new Promise((r) => setTimeout(r, 700));

async function inboxTypes(userId) {
  const rows = await prisma.notification.findMany({
    where: { userId },
    select: { type: true, title: true, message: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows;
}

async function run() {
  const { classes, students, years, users } = env;
  const g5a = classes.g5a;
  const g5aSubjects = env.subjects[g5a];
  const g5aStudents = students.filter((s) => s.classId === g5a);

  await login("admin", users.admin);
  await login("principal", users.principal);
  await login("teacher1", users.teachers[0].email);
  await login("teacher2", users.teachers[1].email);
  await login("teacher3", users.teachers[2].email);

  // Teacher 1 teaches Maths + Computer Science in 5A; teacher 3 teaches
  // Science there. Teacher 2 (English/Urdu) also teaches 5A, so for a
  // class-wide event all three are legitimate recipients.
  const teacher1Id = users.teachers[0].id;
  const parent1Id = users.parents[0].id;
  const student1UserId = users.students[0].id;

  // ── Build an exam through to a lockable state ─────────────────
  currentModule = "Setup";
  let exam = null;
  {
    const res = await api("admin", "POST", "/api/exams", {
      title: "QA Notify Term", term: "Mid Term", classId: g5a,
      academicYear: years.y1, examType: "MID_TERM",
    });
    if (check("Create the exam", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High")) {
      exam = res.json.exam;
    }
  }
  if (!exam) return report();

  await api("admin", "PATCH", "/api/exams", { id: exam.id, status: "ACTIVE" });

  {
    const teacherFor = { Mathematics: "teacher1", "Computer Science": "teacher1", English: "teacher2", Urdu: "teacher2", Science: "teacher3" };
    for (const subj of g5aSubjects) {
      await api(teacherFor[subj.name], "POST", "/api/marks", {
        examId: exam.id,
        entries: g5aStudents.map((s) => ({
          studentId: s.id, subjectId: subj.id,
          marksObtained: Math.round(subj.totalMarks * 0.7),
        })),
      });
    }
    const marks = await prisma.mark.count({ where: { examId: exam.id } });
    check("Marks grid filled for the class",
      marks === g5aStudents.length * g5aSubjects.length,
      `${g5aStudents.length * g5aSubjects.length} marks`, `${marks} marks`, "High");
  }

  // ── Lock → the office should hear about it ────────────────────
  currentModule = "§28 Lock notification";
  {
    const before = (await inboxTypes(teacher1Id)).length;
    const res = await api("principal", "POST", `/api/exams/${exam.id}/lock`, {});
    check("Principal locks the exam", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
    await settle();

    const adminUser = await prisma.user.findFirst({ where: { email: users.admin }, select: { id: true } });
    const adminInbox = await inboxTypes(adminUser.id);
    check("Admin is notified the exam was locked",
      adminInbox.some((n) => /lock/i.test(n.type) || /lock/i.test(n.title)),
      "a lock notification", `types: ${adminInbox.map((n) => n.type).join(",") || "none"}`, "Medium");

    const teacherInbox = await inboxTypes(teacher1Id);
    check("Teacher inbox did not shrink after lock",
      teacherInbox.length >= before, "no lost notifications", `${before} → ${teacherInbox.length}`, "Low");
  }

  // ── Reject → the teachers who must fix it are told, and why ───
  currentModule = "§28 Rejection notification";
  const REASON = "Mathematics totals need re-checking against the answer sheets.";
  {
    const res = await api("principal", "POST", `/api/exams/${exam.id}/reject`, { reason: REASON });
    check("Principal sends the marks back", res.ok, "2xx", `${res.status} ${brief(res.json)}`, "High");
    await settle();
  }

  {
    const inbox = await inboxTypes(teacher1Id);
    const hit = inbox.find((n) => n.type === "MARKS_REJECTED");
    check("Subject teacher receives the rejection",
      !!hit, "MARKS_REJECTED in teacher inbox",
      `types: ${inbox.map((n) => n.type).join(",") || "none"}`, "High");
    check("Rejection notification carries the reason",
      !!hit && hit.message.includes("re-checking"),
      "reason text included", hit ? hit.message : "no notification", "Medium");
  }

  {
    // The whole point of the review step is that families never see marks
    // that are still being corrected — so they must not be told either.
    const studentUser = await prisma.user.findFirst({ where: { id: student1UserId }, select: { id: true } });
    const sInbox = await inboxTypes(studentUser.id);
    const pInbox = await inboxTypes(parent1Id);
    check("Student is NOT told marks were rejected",
      !sInbox.some((n) => n.type === "MARKS_REJECTED"),
      "no MARKS_REJECTED", `types: ${sInbox.map((n) => n.type).join(",") || "none"}`, "Critical");
    check("Parent is NOT told marks were rejected",
      !pInbox.some((n) => n.type === "MARKS_REJECTED"),
      "no MARKS_REJECTED", `types: ${pInbox.map((n) => n.type).join(",") || "none"}`, "Critical");
  }

  {
    // An actor should not be pinged about their own action.
    const principalUser = await prisma.user.findFirst({ where: { email: users.principal }, select: { id: true } });
    const inbox = await inboxTypes(principalUser.id);
    check("Principal is not notified of their own rejection",
      !inbox.some((n) => n.type === "MARKS_REJECTED"),
      "no self-notification", `types: ${inbox.map((n) => n.type).join(",") || "none"}`, "Low");
  }

  // ── Tenant containment ────────────────────────────────────────
  currentModule = "Tenant isolation";
  {
    const qaSchool = await prisma.school.findUnique({ where: { slug: "qa-testing-school" }, select: { id: true } });
    const strays = await prisma.notification.count({
      where: { type: "MARKS_REJECTED", schoolId: { not: qaSchool.id } },
    });
    check("No MARKS_REJECTED notification escaped the QA tenant",
      strays === 0, "0 outside the QA school", `${strays} outside`, "Critical");

    const wrongUser = await prisma.notification.findFirst({
      where: { schoolId: qaSchool.id, user: { schoolId: { not: qaSchool.id } } },
      select: { id: true },
    });
    check("Every QA notification belongs to a QA-tenant user",
      !wrongUser, "no cross-tenant recipient", wrongUser ? `leaked ${wrongUser.id}` : "clean", "Critical");
  }

  // ── Unread counter matches the inbox ──────────────────────────
  currentModule = "Notification API";
  {
    const res = await api("teacher1", "GET", "/api/notifications?unreadOnly=true");
    const list = res.json?.data ?? res.json?.notifications ?? [];
    const dbCount = await prisma.notification.count({ where: { userId: teacher1Id, isRead: false } });
    check("Unread list matches the stored unread count",
      Array.isArray(list) && list.length === dbCount,
      `${dbCount} unread`, `api returned ${Array.isArray(list) ? list.length : brief(res.json)}`, "Medium");
  }

  {
    // A teacher must not be able to read another user's inbox.
    const other = await prisma.notification.findFirst({
      where: { userId: { not: teacher1Id } },
      select: { id: true },
    });
    if (!other) {
      record("BLOCKED", "Teacher cannot mark another user's notification read", "a foreign notification", "none exists", "Low");
    } else {
      const res = await api("teacher1", "PATCH", "/api/notifications", { ids: [other.id] });
      const still = await prisma.notification.findUnique({ where: { id: other.id }, select: { isRead: true } });
      check("Teacher cannot mark another user's notification read",
        still?.isRead === false, "foreign notification untouched",
        `isRead=${still?.isRead} (api ${res.status})`, "High");
    }
  }

  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n${"═".repeat(78)}`);
  console.log(`QA MATRIX 4 — ${pass} passed, ${fail} failed, ${blocked} blocked (${results.length} total)`);
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
  fs.writeFileSync("/tmp/qa-results4.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  // A harness that crashed before asserting anything reports
  // "0 passed, 0 failed" — which reads as success. It is not.
  process.exit(fail > 0 || results.length === 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
