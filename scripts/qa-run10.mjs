// ─────────────────────────────────────────────────────────────────
// QA harness, part 10 — §67-69 conflict suggestions, apply, revalidate.
//
//   node scripts/qa-seed.mjs && node scripts/qa-run10.mjs
//
// None of this existed before: the validator reported clashes and stopped
// there. The checks below cover the three things the spec asks for — that a
// fix is proposed, that approving it actually changes the board, and that the
// board is re-validated afterwards because a fix can cause a new clash.
//
// Conflicts are planted with direct database writes on purpose. The save path
// refuses to create one, so the only way to test *resolving* a conflict is to
// put the board into the state a school would reach some other way (an import,
// a rule added after the fact, or data predating validation).
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const env = JSON.parse(fs.readFileSync("/tmp/qa-env.json", "utf8"));
const prisma = new PrismaClient();

const results = [];
let currentModule = "§67 Suggestions";

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
  // the limiter working correctly, not a defect — so back off and retry rather
  // than reporting a wall of false failures.
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
const brief = (o) => (o === undefined ? "undefined" : JSON.stringify(o) ?? "undefined").slice(0, 220);

async function run() {
  const { classes, years, users, rooms } = env;
  const g5a = classes.g5a;
  const g5b = classes.g5b;
  const maths5a = env.subjects[g5a].find((s) => s.name === "Mathematics");
  const maths5b = env.subjects[g5b].find((s) => s.name === "Mathematics");

  for (const [k, e] of [
    ["admin", users.admin], ["principal", users.principal],
    ["teacher1", users.teachers[0].email], ["student1", users.students[0].email],
  ]) await login(k, e);

  const ttA = (await api("admin", "POST", "/api/timetable", {
    classId: g5a, academicYear: years.y1, term: "ANNUAL",
  })).json?.data;
  const ttB = (await api("admin", "POST", "/api/timetable", {
    classId: g5b, academicYear: years.y1, term: "ANNUAL",
  })).json?.data;
  if (!check("Two timetables created", !!ttA && !!ttB, "two boards", `${!!ttA} ${!!ttB}`, "High")) return report();

  const slot = (tt, d, p) => tt.slots.find((s) => s.dayOfWeek === d && s.periodNumber === p);
  const a1 = slot(ttA, 1, 1);
  const b1 = slot(ttB, 1, 1);

  // 5A: teacher 1 teaches Maths in QA-A, Monday period 1. Legitimate.
  await api("admin", "PUT", `/api/timetable/${ttA.id}`, {
    slots: [{ ...a1, subjectId: maths5a.id, teacherId: users.teachers[0].id, roomId: rooms["QA-A"].id }],
  });

  // 5B: the same teacher AND the same room in the same period — the clash the
  // save path would refuse, planted directly so it can be resolved.
  await prisma.timetableSlot.update({
    where: { id: b1.id },
    data: { subjectId: maths5b.id, teacherId: users.teachers[0].id, roomId: rooms["QA-A"].id },
  });

  // ── §67 · propose fixes ───────────────────────────────────────
  currentModule = "§67 Suggestions";
  let report1 = null;
  {
    const res = await api("admin", "GET", `/api/timetable/${ttB.id}/suggestions`);
    report1 = res.json?.data;
    check("§67: the board reports its conflicts",
      res.ok && report1?.validation?.counts?.critical >= 2,
      "at least 2 critical (teacher + room)",
      `${res.status} ${brief(report1?.validation?.counts)}`, "High");

    check("§67: a fix is proposed for the teacher clash",
      report1?.suggestions?.some((s) => s.conflictType === "TEACHER_DOUBLE_BOOKED"),
      "a TEACHER_DOUBLE_BOOKED suggestion",
      brief(report1?.suggestions?.map((s) => s.conflictType)), "High");

    check("§67: a fix is proposed for the room clash",
      report1?.suggestions?.some((s) => s.conflictType === "ROOM_DOUBLE_BOOKED"),
      "a ROOM_DOUBLE_BOOKED suggestion",
      brief(report1?.suggestions?.map((s) => s.conflictType)), "High");

    check("§67: every proposal is a concrete change, not advice",
      report1?.suggestions?.length > 0 &&
        report1.suggestions.every((s) => s.action?.type && s.action?.slotId && s.description?.length > 10),
      "each has an applicable action + description",
      brief(report1?.suggestions?.[0]), "High");

    // A proposal that names a busy teacher would be worse than none.
    const proposedTeachers = report1.suggestions
      .filter((s) => s.action.type === "REASSIGN_TEACHER")
      .map((s) => s.action.teacherId);
    check("§67: no proposal offers a teacher who is already booked that period",
      !proposedTeachers.includes(users.teachers[0].id),
      "the clashing teacher is never proposed", brief(proposedTeachers), "Critical");

    const proposedRooms = report1.suggestions
      .filter((s) => s.action.type === "REASSIGN_ROOM")
      .map((s) => s.action.roomId);
    check("§67: no proposal offers the room that is already taken",
      !proposedRooms.includes(rooms["QA-A"].id),
      "the clashing room is never proposed", brief(proposedRooms), "Critical");
  }

  // ── §68 · approve and apply ───────────────────────────────────
  currentModule = "§68 Apply";
  {
    const fix = report1.suggestions.find((s) => s.action.type === "REASSIGN_TEACHER");
    const res = await api("admin", "POST", `/api/timetable/${ttB.id}/suggestions`, { action: fix.action });
    check("§68: an approved fix is applied",
      res.ok, "200", `${res.status} ${brief(res.json)}`, "High");

    const stored = await prisma.timetableSlot.findUnique({
      where: { id: b1.id }, select: { teacherId: true },
    });
    check("§68: the board actually changed — the slot holds the new teacher",
      stored?.teacherId === fix.action.teacherId,
      "new teacherId", brief(stored), "High");

    check("§68: the teacher clash is gone from the fresh validation",
      res.json?.data?.report?.validation?.counts?.teacher === 0,
      "0 teacher conflicts",
      brief(res.json?.data?.report?.validation?.counts), "High");

    check("§68: the room clash is still reported — one fix fixes one thing",
      res.json?.data?.report?.validation?.counts?.room > 0,
      "room conflict remains", brief(res.json?.data?.report?.validation?.counts), "Medium");
  }
  {
    const after = await api("admin", "GET", `/api/timetable/${ttB.id}/suggestions`);
    const roomFix = after.json?.data?.suggestions?.find((s) => s.action.type === "REASSIGN_ROOM");
    const res = await api("admin", "POST", `/api/timetable/${ttB.id}/suggestions`, { action: roomFix.action });
    check("§68: applying the second fix clears the board",
      res.ok && res.json?.data?.report?.validation?.counts?.critical === 0,
      "0 critical", `${res.status} ${brief(res.json?.data?.report?.validation?.counts)}`, "High");

    const publish = await api("admin", "PUT", `/api/timetable/${ttB.id}`, { action: "publish" });
    check("§68: a board cleared by suggestions can then be published",
      publish.ok, "200", `${publish.status} ${brief(publish.json)}`, "High");
    await api("admin", "PUT", `/api/timetable/${ttB.id}`, { action: "unpublish" });
  }

  // ── §69 · revalidation after applying ─────────────────────────
  currentModule = "§69 Revalidation";
  {
    // Apply a change that is legal to make but creates a fresh clash. The point
    // of §69 is that the response says so instead of reporting success.
    const res = await api("admin", "POST", `/api/timetable/${ttB.id}/suggestions`, {
      action: { type: "REASSIGN_TEACHER", slotId: b1.id, teacherId: users.teachers[0].id },
    });
    check("§69: applying a change re-validates and reports the NEW conflict it caused",
      res.ok && res.json?.data?.report?.validation?.counts?.teacher > 0,
      "teacher conflict reported after apply",
      `${res.status} ${brief(res.json?.data?.report?.validation?.counts)}`, "Critical");

    check("§69: the revalidation carries fresh suggestions for the new conflict",
      (res.json?.data?.report?.suggestions?.length ?? 0) > 0,
      "suggestions for the new state",
      brief(res.json?.data?.report?.suggestions?.map((s) => s.conflictType)), "High");

    // …and the board it just broke must not be publishable.
    const publish = await api("admin", "PUT", `/api/timetable/${ttB.id}`, { action: "publish" });
    check("§69: the newly broken board cannot be published",
      publish.status === 409, "409", `${publish.status} ${brief(publish.json)}`, "Critical");
  }
  {
    // A stale proposal — the target period filled since the suggestion was made
    // — must be refused rather than silently overwriting the lesson there.
    const free = await prisma.timetableSlot.findFirst({
      where: { timetableId: ttB.id, subjectId: null, slotType: "CLASS" },
      select: { id: true },
    });
    await prisma.timetableSlot.update({
      where: { id: free.id },
      data: { subjectId: maths5b.id, teacherId: users.teachers[2].id },
    });
    const res = await api("admin", "POST", `/api/timetable/${ttB.id}/suggestions`, {
      action: { type: "MOVE_SLOT", slotId: b1.id, targetSlotId: free.id },
    });
    check("§69: a stale move onto a now-occupied period is refused",
      res.status === 409 && /no longer free/i.test(JSON.stringify(res.json)),
      "409 no longer free", `${res.status} ${brief(res.json)}`, "High");
  }
  {
    // A move must never half-land: the lesson leaves one cell and arrives in
    // the other, or nothing happens at all.
    const target = await prisma.timetableSlot.findFirst({
      where: { timetableId: ttB.id, subjectId: null, slotType: "CLASS" },
      select: { id: true },
    });
    const before = await prisma.timetableSlot.findUnique({
      where: { id: b1.id }, select: { subjectId: true, teacherId: true },
    });
    const res = await api("admin", "POST", `/api/timetable/${ttB.id}/suggestions`, {
      action: { type: "MOVE_SLOT", slotId: b1.id, targetSlotId: target.id },
    });
    const [src, dst] = await Promise.all([
      prisma.timetableSlot.findUnique({ where: { id: b1.id }, select: { subjectId: true, teacherId: true } }),
      prisma.timetableSlot.findUnique({ where: { id: target.id }, select: { subjectId: true, teacherId: true } }),
    ]);
    check("§69: a move empties the source and fills the target, atomically",
      res.ok && src?.subjectId === null && dst?.subjectId === before.subjectId && dst?.teacherId === before.teacherId,
      "source empty, target holds the lesson",
      `${res.status} src=${brief(src)} dst=${brief(dst)}`, "Critical");
  }

  // ── Guards on the endpoint itself ─────────────────────────────
  currentModule = "§67-69 Authorization";
  {
    for (const who of ["student1", "teacher1"]) {
      const read = await api(who, "GET", `/api/timetable/${ttB.id}/suggestions`);
      check(`${who} cannot read conflict suggestions`,
        read.status === 403, "403", `${read.status} ${brief(read.json)}`, "High");
      const write = await api(who, "POST", `/api/timetable/${ttB.id}/suggestions`, {
        action: { type: "REASSIGN_TEACHER", slotId: b1.id, teacherId: users.teachers[1].id },
      });
      check(`${who} cannot apply a fix`,
        write.status === 403, "403", `${write.status} ${brief(write.json)}`, "Critical");
    }
    const principal = await api("principal", "GET", `/api/timetable/${ttB.id}/suggestions`);
    check("A principal can read conflict suggestions",
      principal.ok, "200", `${principal.status}`, "Medium");

    // A slot from another class's board must not be reachable through this one.
    const foreign = await api("admin", "POST", `/api/timetable/${ttB.id}/suggestions`, {
      action: { type: "REASSIGN_TEACHER", slotId: a1.id, teacherId: users.teachers[1].id },
    });
    check("A slot from another timetable cannot be edited through this one",
      foreign.status === 400, "400", `${foreign.status} ${brief(foreign.json)}`, "Critical");
  }

  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n${"═".repeat(80)}`);
  console.log(`QA MATRIX 10 — ${pass} passed, ${fail} failed, ${blocked} blocked (${results.length} total)`);
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
  fs.writeFileSync("/tmp/qa-results10.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  // A harness that crashed before asserting anything reports
  // "0 passed, 0 failed" — which reads as success. It is not.
  process.exit(fail > 0 || results.length === 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
