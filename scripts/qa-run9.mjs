// ─────────────────────────────────────────────────────────────────
// QA harness, part 9 — §58 multi-room exams.
//
//   node scripts/qa-seed.mjs && node scripts/qa-run9.mjs
//
// The feature did not exist before this session: ExamSchedule held one roomId,
// so a class larger than any single room simply could not be scheduled. These
// checks cover the two rules the spec names — no student seated twice, no room
// over capacity — plus the ones that make those rules hold under editing.
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const env = JSON.parse(fs.readFileSync("/tmp/qa-env.json", "utf8"));
const prisma = new PrismaClient();

const results = [];
let currentModule = "§58 Multi-room exams";

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
  const { classes, years, users, rooms, examPeriods } = env;
  const g5a = classes.g5a;
  const subjects = env.subjects[g5a];

  for (const [k, e] of [
    ["admin", users.admin], ["teacher1", users.teachers[0].email],
    ["student1", users.students[0].email], ["parent1", users.parents[0].email],
  ]) await login(k, e);

  const tiny = rooms["QA-TINY"];           // capacity 2
  const roll = await prisma.student.count({ where: { classId: g5a, status: "active" } });
  // Size QA-A so that QA-A + QA-TINY exactly seats the class and neither room
  // could hold it alone — the split has to be necessary for the test to mean
  // anything.
  const seatsA = Math.max(1, roll - tiny.capacity);
  await prisma.classRoom.update({ where: { id: rooms["QA-A"].id }, data: { capacity: seatsA } });

  const exam = await api("admin", "POST", "/api/exams", {
    title: "QA Multi-Room Exam", examType: "MID_TERM", classId: g5a,
    academicYear: years.y1, term: "TERM_1",
  });
  const examId = exam.json?.exam?.id;
  if (!check("Exam created", !!examId, "201", `${exam.status} ${brief(exam.json)}`, "High")) return report();

  // ── The old failure mode: no single room is big enough ────────
  {
    const res = await api("admin", "POST", "/api/academic/exam-schedule", {
      examId, subjectId: subjects[0].id, date: `${years.y1}-11-10`,
      periodDefinitionId: examPeriods[0], roomId: rooms["QA-A"].id,
    });
    check("A room too small for the class is still refused on the single-room path",
      res.status === 409 && /Capacity conflict/i.test(JSON.stringify(res.json)),
      "409 capacity conflict", `${res.status} ${brief(res.json)}`, "High");
    check("…and the refusal now points at splitting the paper",
      /split the paper across several rooms/i.test(JSON.stringify(res.json)),
      "message mentions splitting", brief(res.json), "Medium");
  }

  // ── Schedule roomless, then allocate across two rooms ─────────
  let scheduleId = null;
  {
    const res = await api("admin", "POST", "/api/academic/exam-schedule", {
      examId, subjectId: subjects[0].id, date: `${years.y1}-11-10`,
      periodDefinitionId: examPeriods[0],
    });
    scheduleId = res.json?.data?.id;
    check("Paper scheduled without a room, ready for allocation",
      res.ok && !!scheduleId, "201", `${res.status} ${brief(res.json)}`, "High");
  }

  {
    const res = await api("admin", "PUT", "/api/academic/exam-schedule/rooms", {
      scheduleId, roomIds: [rooms["QA-A"].id, tiny.id],
    });
    const plan = res.json?.data;
    check(`§58: ${roll} students split across a ${seatsA}-seat and a ${tiny.capacity}-seat room`,
      res.ok && plan?.rooms?.length === 2 && plan.totalStudents === roll,
      `2 rooms seating ${roll}`, `${res.status} ${brief(res.json)}`, "High");

    check("§58: no room is seated beyond its capacity",
      !!plan && plan.rooms.every((r) => r.seated <= r.capacity),
      "seated <= capacity everywhere",
      brief(plan?.rooms?.map((r) => `${r.roomNumber} ${r.seated}/${r.capacity}`)), "Critical");

    check("§58: rooms fill in the order given, primary first",
      plan?.rooms?.[0]?.roomNumber === "QA-A" && plan.rooms[0].isPrimary === true,
      "QA-A primary", brief(plan?.rooms?.map((r) => r.roomNumber)), "Medium");

    check("§58: students are seated in roll-number order",
      (() => {
        const flat = plan.rooms.flatMap((r) => r.students.map((s) => s.rollNumber));
        return JSON.stringify(flat) === JSON.stringify([...flat].sort());
      })(),
      "roll numbers ascending across rooms",
      brief(plan?.rooms?.flatMap((r) => r.students.map((s) => s.rollNumber))), "Medium");
  }

  // ── No student seated twice — the rule, at the database ───────
  {
    const seats = await prisma.examSeat.findMany({
      where: { examScheduleId: scheduleId }, select: { studentId: true },
    });
    const unique = new Set(seats.map((s) => s.studentId));
    check("§58: every student holds exactly one seat",
      seats.length === roll && unique.size === roll,
      `${roll} seats, ${roll} distinct students`, `${seats.length} seats, ${unique.size} distinct`, "Critical");

    // The constraint itself, not just the allocator that respects it.
    const anySeat = await prisma.examSeat.findFirst({ where: { examScheduleId: scheduleId } });
    const anyRoom = await prisma.examRoom.findFirst({
      where: { examScheduleId: scheduleId, id: { not: anySeat.examRoomId } },
    });
    let rejected = false;
    try {
      await prisma.examSeat.create({
        data: {
          campusId: env.campus, examScheduleId: scheduleId,
          examRoomId: anyRoom.id, studentId: anySeat.studentId, seatNumber: 99,
        },
      });
    } catch { rejected = true; }
    check("§58: seating one student twice is rejected by the database itself",
      rejected, "unique constraint violation", rejected ? "rejected" : "second seat created", "Critical");
  }

  // ── Re-allocation must not leave a student in two rooms ───────
  {
    const res = await api("admin", "PUT", "/api/academic/exam-schedule/rooms", {
      scheduleId, roomIds: [rooms["QA-C"].id],
    });
    const plan = res.json?.data;
    const seats = await prisma.examSeat.count({ where: { examScheduleId: scheduleId } });
    check("§58: re-allocating to one big room re-seats everyone cleanly",
      res.ok && plan.rooms.length === 1 && seats === roll,
      `1 room, ${roll} seats`, `${res.status} rooms=${plan?.rooms?.length} seats=${seats}`, "High");

    const sched = await prisma.examSchedule.findUnique({
      where: { id: scheduleId }, select: { roomId: true },
    });
    check("§58: the date sheet's single roomId follows the new primary room",
      sched?.roomId === rooms["QA-C"].id, "QA-C", brief(sched), "High");
  }

  // ── Capacity and duplication rules on the allocation endpoint ─
  {
    const res = await api("admin", "PUT", "/api/academic/exam-schedule/rooms", {
      scheduleId, roomIds: [rooms["QA-A"].id],
    });
    check("§58: a plan that does not seat the whole class is refused",
      res.status === 409 && /short/i.test(JSON.stringify(res.json)),
      "409 naming the shortfall", `${res.status} ${brief(res.json)}`, "High");
  }
  {
    const res = await api("admin", "PUT", "/api/academic/exam-schedule/rooms", {
      scheduleId, roomIds: [rooms["QA-A"].id, rooms["QA-A"].id],
    });
    check("§58: the same room listed twice is refused",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "Medium");
  }
  {
    await prisma.classRoom.update({ where: { id: rooms["QA-B"].id }, data: { capacity: 0 } });
    const res = await api("admin", "PUT", "/api/academic/exam-schedule/rooms", {
      scheduleId, roomIds: [rooms["QA-C"].id, rooms["QA-B"].id],
    });
    check("§58: a room with no recorded capacity cannot join a seating plan",
      res.status === 400 && /capacity/i.test(JSON.stringify(res.json)),
      "400 naming the unsized room", `${res.status} ${brief(res.json)}`, "Medium");
    await prisma.classRoom.update({ where: { id: rooms["QA-B"].id }, data: { capacity: 30 } });
  }

  // ── Cross-paper room clashes now see overflow rooms ──────────
  {
    const second = await api("admin", "POST", "/api/academic/exam-schedule", {
      examId, subjectId: subjects[1].id, date: `${years.y1}-11-10`,
      periodDefinitionId: examPeriods[1] ?? examPeriods[0],
    });
    const secondId = second.json?.data?.id;

    // Put the first paper back on two rooms so QA-TINY is an *overflow* room.
    await api("admin", "PUT", "/api/academic/exam-schedule/rooms", {
      scheduleId, roomIds: [rooms["QA-A"].id, tiny.id],
    });

    if (examPeriods[1]) {
      // Different period — no clash, and this is the control for the next check.
      const ok = await api("admin", "PUT", "/api/academic/exam-schedule/rooms", {
        scheduleId: secondId, roomIds: [tiny.id, rooms["QA-C"].id],
      });
      check("§58: the same room in a different period is not a clash",
        ok.ok, "200", `${ok.status} ${brief(ok.json)}`, "Medium");
    }

    // Same date + period as paper 1, asking for paper 1's *overflow* room.
    const third = await api("admin", "POST", "/api/academic/exam-schedule", {
      examId, subjectId: subjects[2].id, date: `${years.y1}-11-11`,
      periodDefinitionId: examPeriods[0],
    });
    const thirdId = third.json?.data?.id;
    await prisma.examSchedule.update({
      where: { id: thirdId },
      data: { date: new Date(`${years.y1}-11-10T00:00:00.000Z`) },
    });
    const clash = await api("admin", "PUT", "/api/academic/exam-schedule/rooms", {
      scheduleId: thirdId, roomIds: [tiny.id, rooms["QA-C"].id],
    });
    check("§58: booking another paper's OVERFLOW room in the same slot is blocked",
      clash.status === 409 && /already hosting/i.test(JSON.stringify(clash.json)),
      "409 already hosting", `${clash.status} ${brief(clash.json)}`, "Critical");

    // And the single-room date-sheet path must see overflow rooms too, or the
    // two ways of booking a room disagree with each other.
    const viaDatesheet = await api("admin", "PATCH", "/api/academic/exam-schedule", {
      id: thirdId, roomId: tiny.id, date: `${years.y1}-11-10`,
      periodDefinitionId: examPeriods[0],
    });
    check("§58: the date-sheet path also sees another paper's overflow room",
      viaDatesheet.status === 409, "409", `${viaDatesheet.status} ${brief(viaDatesheet.json)}`, "Critical");
  }

  // ── Authorization ─────────────────────────────────────────────
  {
    for (const who of ["student1", "parent1"]) {
      const read = await api(who, "GET", `/api/academic/exam-schedule/rooms?scheduleId=${scheduleId}`);
      check(`§58: ${who} cannot read the seating plan`,
        read.status === 403, "403", `${read.status} ${brief(read.json)}`, "Critical");
      const write = await api(who, "PUT", "/api/academic/exam-schedule/rooms", {
        scheduleId, roomIds: [rooms["QA-C"].id],
      });
      check(`§58: ${who} cannot allocate rooms`,
        write.status === 403, "403", `${write.status} ${brief(write.json)}`, "Critical");
    }
    const teacher = await api("teacher1", "PUT", "/api/academic/exam-schedule/rooms", {
      scheduleId, roomIds: [rooms["QA-C"].id],
    });
    check("§58: a teacher cannot allocate exam rooms",
      teacher.status === 403, "403", `${teacher.status} ${brief(teacher.json)}`, "High");
  }

  // ── Deleting the paper takes its seating plan with it ─────────
  {
    await api("admin", "DELETE", `/api/academic/exam-schedule?id=${scheduleId}`);
    const [roomsLeft, seatsLeft] = await Promise.all([
      prisma.examRoom.count({ where: { examScheduleId: scheduleId } }),
      prisma.examSeat.count({ where: { examScheduleId: scheduleId } }),
    ]);
    check("§58: removing a paper removes its rooms and seats",
      roomsLeft === 0 && seatsLeft === 0,
      "0 rooms, 0 seats", `${roomsLeft} rooms, ${seatsLeft} seats`, "High");
  }

  await prisma.classRoom.update({ where: { id: rooms["QA-A"].id }, data: { capacity: 20 } });
  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n${"═".repeat(80)}`);
  console.log(`QA MATRIX 9 — ${pass} passed, ${fail} failed, ${blocked} blocked (${results.length} total)`);
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
  fs.writeFileSync("/tmp/qa-results9.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
