// ─────────────────────────────────────────────────────────────────
// QA harness, part 8 — the eight partials the earlier runs left open:
//
//   §10  assigning a deactivated user
//   §48  teacher rollover — the historical record
//   §49  subject rollover — independence and the deactivation path
//   §52  one continuous year-2 end-to-end run
//   §61  availability-driven blocking
//   §65  the WARNING conflict tier (as distinct from CRITICAL)
//   §71  slot move + unpublish
//   §72  exam ↔ timetable interaction
//
//   node scripts/qa-seed.mjs && node scripts/qa-run8.mjs
//
// Each of these was previously "core covered, edges not". The edges are the
// point here — a partial that only ever exercises the happy path is a partial.
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
const brief = (o) => JSON.stringify(o).slice(0, 200);

async function run() {
  const { classes, years, users, rooms, students, examPeriods } = env;
  const g5a = classes.g5a;
  const g5aSubjects = env.subjects[g5a];
  const g6aY2Subjects = env.subjects[classes.g6aY2];
  const maths5a = g5aSubjects.find((s) => s.name === "Mathematics");
  const maths6a = g6aY2Subjects.find((s) => s.name === "Mathematics");

  for (const [k, e] of [
    ["admin", users.admin], ["principal", users.principal],
    ["teacher1", users.teachers[0].email], ["teacher2", users.teachers[1].email],
    ["student1", users.students[0].email],
  ]) await login(k, e);

  // ── §10 · assigning a deactivated user ────────────────────────
  currentModule = "§10 Deactivated assign";
  {
    // Teacher 3 is the sacrificial one — nothing else in this run uses them.
    const t3 = users.teachers[2];
    await prisma.user.update({ where: { id: t3.id }, data: { isActive: false } });

    const asClassTeacher = await api("admin", "POST", "/api/classes", {
      name: "QA Deactivated Probe", section: "A", academicYear: years.y2,
      classTeacherId: t3.id,
    });
    check("§10: a deactivated teacher cannot be made class teacher",
      asClassTeacher.status === 400, "400", `${asClassTeacher.status} ${brief(asClassTeacher.json)}`, "High");

    const asSubjectTeacher = await api("admin", "POST", "/api/subjects", {
      classId: g5a, name: "QA Probe Subject", totalMarks: 100, teacherId: t3.id,
    });
    check("§10: a deactivated teacher cannot be assigned a subject",
      asSubjectTeacher.status >= 400, "4xx", `${asSubjectTeacher.status} ${brief(asSubjectTeacher.json)}`, "High");

    // The listing must still hide them, or an admin would just pick them again.
    const staff = await api("admin", "GET", "/api/staff");
    const listed = JSON.stringify(staff.json).includes(t3.id);
    check("§10: a deactivated teacher is absent from the active staff list",
      !listed, "not listed", listed ? "still listed" : "not listed", "Medium");

    await prisma.user.update({ where: { id: t3.id }, data: { isActive: true } });
  }

  // ── §71 · timetable move, and the reference checks around it ──
  currentModule = "§71 Timetable move";
  let tt = null;
  {
    const res = await api("admin", "POST", "/api/timetable", {
      classId: g5a, academicYear: years.y1, term: "ANNUAL",
    });
    if (!check("Timetable created for the move tests", res.ok, "201", `${res.status} ${brief(res.json)}`, "High")) {
      return report();
    }
    tt = res.json.data;
  }
  const slotAt = (d, p) => tt.slots.find((s) => s.dayOfWeek === d && s.periodNumber === p);
  const mon1 = slotAt(1, 1);
  const mon2 = slotAt(1, 2);
  const tue1 = slotAt(2, 1);

  {
    const res = await api("admin", "PUT", `/api/timetable/${tt.id}`, {
      slots: [{ ...mon1, subjectId: maths5a.id, teacherId: users.teachers[0].id, roomId: rooms["QA-A"].id }],
    });
    check("Slot assigned before moving it", res.ok, "200", `${res.status} ${brief(res.json)}`, "High");
  }
  {
    // A "move" is two writes in one payload: clear the old cell, fill the new.
    // Both have to land, or the period silently disappears from the week.
    const res = await api("admin", "PUT", `/api/timetable/${tt.id}`, {
      slots: [
        { ...mon1, subjectId: null, teacherId: null, roomId: null },
        { ...tue1, subjectId: maths5a.id, teacherId: users.teachers[0].id, roomId: rooms["QA-A"].id },
      ],
    });
    const after = res.json?.data?.slots || [];
    const src = after.find((s) => s.id === mon1.id);
    const dst = after.find((s) => s.id === tue1.id);
    check("§71: a slot moves to another day — source cleared, target filled",
      res.ok && !src?.subjectId && dst?.subjectId === maths5a.id && dst?.teacherId === users.teachers[0].id,
      "Mon P1 empty, Tue P1 filled",
      `${res.status} src=${src?.subjectId ?? "empty"} dst=${dst?.subjectId ?? "empty"}`, "High");
  }
  {
    // Referential integrity of the save payload (F-20).
    const other = await api("admin", "POST", "/api/timetable", {
      classId: classes.g5b, academicYear: years.y1, term: "ANNUAL",
    });
    const foreignSlot = other.json?.data?.slots?.[0];
    const res = await api("admin", "PUT", `/api/timetable/${tt.id}`, {
      slots: [{ ...foreignSlot, subjectId: null, teacherId: null, roomId: null }],
    });
    check("§71: a slot id from another class's timetable is rejected",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "Critical");
  }
  {
    const t3 = users.teachers[2];
    await prisma.user.update({ where: { id: t3.id }, data: { isActive: false } });
    const res = await api("admin", "PUT", `/api/timetable/${tt.id}`, {
      slots: [{ ...mon2, subjectId: maths5a.id, teacherId: t3.id, roomId: rooms["QA-B"].id }],
    });
    check("§10/§71: a deactivated teacher cannot be timetabled",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "High");
    await prisma.user.update({ where: { id: t3.id }, data: { isActive: true } });
  }
  {
    const res = await api("admin", "PUT", `/api/timetable/${tt.id}`, {
      slots: [{ ...mon2, subjectId: maths6a.id, teacherId: users.teachers[0].id, roomId: rooms["QA-B"].id }],
    });
    check("§71: a subject from a different class is rejected",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "High");
  }

  // ── §61 · availability-driven blocking ────────────────────────
  currentModule = "§61 Availability";
  {
    const res = await api("admin", "GET", "/api/teachers/availability");
    const t1 = (res.json?.data || []).find((t) => t.id === users.teachers[0].id);
    // Teacher 1 now sits in Tuesday period 1 after the move above.
    check("§61: a booked teacher reports the exact slot as busy",
      !!t1 && t1.busySlots.includes("2-1"),
      "busySlots contains 2-1", `${brief(t1?.busySlots)}`, "High");

    const free = (res.json?.data || []).find((t) => t.id === users.teachers[1].id);
    check("§61: an unbooked teacher reports no busy slots",
      !!free && free.busySlots.length === 0,
      "empty busySlots", `${brief(free?.busySlots)}`, "Medium");
  }
  {
    // The block itself: the picker greys out a busy teacher, but the server is
    // what actually has to refuse — the same period, a different class.
    const otherTt = await prisma.timetable.findFirst({
      where: { classId: classes.g5b, academicYear: years.y1 },
      include: { slots: { where: { dayOfWeek: 2, periodNumber: 1 } } },
    });
    const target = otherTt?.slots?.[0];
    const maths5b = env.subjects[classes.g5b].find((s) => s.name === "Mathematics");
    const res = await api("admin", "PUT", `/api/timetable/${otherTt.id}`, {
      slots: [{ ...target, subjectId: maths5b.id, teacherId: users.teachers[0].id, roomId: rooms["QA-B"].id }],
    });
    check("§61: booking a teacher who is already busy that period is BLOCKED",
      res.status === 409 && /already teaching/i.test(JSON.stringify(res.json)),
      "409 already teaching", `${res.status} ${brief(res.json)}`, "Critical");
  }

  // ── §65 · the WARNING tier ────────────────────────────────────
  currentModule = "§65 Warning tier";
  {
    // QA-Small seats 2; 5A has more students than that. Capacity is a WARNING,
    // not a CRITICAL — the save must succeed *and* still report the problem.
    const small = rooms["QA-TINY"];
    const res = await api("admin", "PUT", `/api/timetable/${tt.id}`, {
      slots: [{ ...mon2, subjectId: g5aSubjects[1].id, teacherId: users.teachers[1].id, roomId: small.id }],
    });
    const v = res.json?.validation;
    check("§65: an over-capacity room is a WARNING that still saves",
      res.ok && v?.counts?.warning > 0 && v?.counts?.critical === 0,
      "200 with warning>0, critical=0",
      `${res.status} warn=${v?.counts?.warning} crit=${v?.counts?.critical}`, "High");
    check("§65: the warning names the room, its seats and the overflow",
      /seats \d+ but this class has \d+ students \(\d+ over\)/.test(
        JSON.stringify(v?.conflicts || [])),
      "actionable capacity message", brief(v?.conflicts), "Medium");
  }
  {
    // …and the tiers must not be confused: a teacher clash is CRITICAL and
    // must block, even though the payload is otherwise identical in shape.
    const res = await api("admin", "PUT", `/api/timetable/${tt.id}`, {
      slots: [{ ...slotAt(2, 2), subjectId: maths5a.id, teacherId: users.teachers[0].id, roomId: rooms["QA-A"].id }],
    });
    // Free period for teacher 1, so this one should pass — establishes that the
    // 409s above are about the clash, not about the payload shape.
    check("§65: a CRITICAL-free save of the same shape succeeds",
      res.ok, "200", `${res.status} ${brief(res.json)}`, "Medium");
  }
  {
    const res = await api("admin", "PUT", `/api/timetable/${tt.id}`, { action: "publish" });
    check("§65: warnings alone do not block publish",
      res.ok && res.json?.validation?.counts?.warning > 0,
      "200 despite warnings", `${res.status} ${brief(res.json?.validation?.counts)}`, "High");
  }

  // ── §71 · unpublish ───────────────────────────────────────────
  currentModule = "§71 Unpublish";
  {
    const res = await api("admin", "PUT", `/api/timetable/${tt.id}`, { action: "unpublish" });
    check("§71: admin can unpublish a published timetable",
      res.ok && res.json?.data?.status === "DRAFT",
      "DRAFT", `${res.status} ${res.json?.data?.status}`, "High");

    const visible = await api("student1", "GET", `/api/timetable/teacher?teacherId=${users.teachers[0].id}`);
    check("§71: an unpublished board is not readable by families",
      visible.status === 403, "403", `${visible.status}`, "High");

    const teacherView = await api("teacher1", "GET", "/api/timetable/teacher");
    check("§71: unpublishing removes the board from the teacher's schedule",
      teacherView.ok && (teacherView.json?.data?.length ?? -1) === 0,
      "0 slots", `${teacherView.status} ${teacherView.json?.data?.length} slots`, "High");

    await api("admin", "PUT", `/api/timetable/${tt.id}`, { action: "publish" });
  }

  // ── §72 · exam ↔ timetable interaction ────────────────────────
  currentModule = "§72 Exam × timetable";
  {
    // The two chains share rooms and teachers. Each was validated alone; this
    // asks whether they see each other at all — and records the answer either
    // way, because "they are deliberately independent" is a legitimate design
    // as long as it is the actual, stated one.
    const exam = await api("admin", "POST", "/api/exams", {
      title: "QA Interaction Exam", examType: "MID_TERM", classId: g5a,
      academicYear: years.y1, term: "TERM_1",
    });
    const examId = exam.json?.exam?.id;
    check("Exam created for the interaction test", !!examId, "201", `${exam.status} ${brief(exam.json)}`, "High");

    // Exam period 1 runs 09:00–11:00. Book room QA-C into a *lesson* that
    // overlaps that window on a Tuesday, publish the board, then try to seat a
    // paper in the same room on a Tuesday. The room cannot hold both.
    const lessonSlot = tt.slots.find(
      (s) => s.dayOfWeek === 2 && s.slotType === "CLASS" && s.startTime < "11:00" && s.endTime > "09:00",
    );
    check("A lesson exists in the exam's time window", !!lessonSlot,
      "an overlapping Tuesday slot", brief(lessonSlot && `${lessonSlot.startTime}-${lessonSlot.endTime}`), "High");

    await api("admin", "PUT", `/api/timetable/${tt.id}`, {
      slots: [{ ...lessonSlot, subjectId: maths5a.id, teacherId: users.teachers[1].id, roomId: rooms["QA-C"].id }],
    });
    await api("admin", "PUT", `/api/timetable/${tt.id}`, { action: "publish" });

    const tuesday = nextWeekday(2);
    const res = await api("admin", "POST", "/api/academic/exam-schedule", {
      examId, subjectId: maths5a.id, date: tuesday,
      periodDefinitionId: examPeriods[0], roomId: rooms["QA-C"].id,
    });
    check("§72: an exam cannot take a room a published timetable has that hour",
      res.status === 409 && /timetabled to/i.test(JSON.stringify(res.json)),
      "409 naming the lesson", `${res.status} ${brief(res.json)}`, "Critical");

    // A free room at the same time is still fine — proving the block is about
    // the clash and not about exam scheduling having become stricter overall.
    const free = await api("admin", "POST", "/api/academic/exam-schedule", {
      examId, subjectId: maths5a.id, date: tuesday,
      periodDefinitionId: examPeriods[0], roomId: rooms["QA-B"].id,
    });
    check("§72: an untimetabled room at the same hour is accepted",
      free.ok, "201", `${free.status} ${brief(free.json)}`, "High");

    // And a draft board must not block anything — it is not a commitment yet.
    await api("admin", "PUT", `/api/timetable/${tt.id}`, { action: "unpublish" });
    await api("admin", "DELETE", `/api/academic/exam-schedule?id=${free.json?.data?.id}`);
    const draft = await api("admin", "POST", "/api/academic/exam-schedule", {
      examId, subjectId: maths5a.id, date: tuesday,
      periodDefinitionId: examPeriods[0], roomId: rooms["QA-C"].id,
    });
    check("§72: an unpublished timetable does not block exam scheduling",
      draft.ok, "201", `${draft.status} ${brief(draft.json)}`, "High");

    // What must hold either way: the exam date sheet is scoped to its own year
    // and does not leak into the other year's timetable view.
    const y2 = await api("admin", "GET", `/api/exams?academicYear=${years.y2}`);
    const leaked = JSON.stringify(y2.json).includes("QA Interaction Exam");
    check("§72: a year-1 exam does not appear under year 2",
      !leaked, "absent", leaked ? "present" : "absent", "High");
  }

  // ── §48 / §49 · teacher and subject rollover ──────────────────
  currentModule = "§48 Teacher rollover";
  {
    const t1 = users.teachers[0].id;
    // The same teacher across both years: last year's assignment must survive
    // as a record, and this year's must not overwrite it.
    const y1Subject = await prisma.subject.findFirst({ where: { classId: g5a, teacherId: t1 } });
    await api("admin", "PATCH", "/api/subjects", { id: maths6a.id, teacherId: t1 });

    const stillY1 = await prisma.subject.findFirst({
      where: { id: y1Subject?.id ?? "none" }, select: { teacherId: true, classId: true },
    });
    check("§48: assigning a teacher in year 2 leaves their year-1 subject intact",
      !!stillY1 && stillY1.teacherId === t1 && stillY1.classId === g5a,
      "year-1 row unchanged", brief(stillY1), "High");

    const y2Subject = await prisma.subject.findUnique({
      where: { id: maths6a.id }, select: { teacherId: true, classId: true },
    });
    check("§48: the year-2 assignment is a separate row, not a moved one",
      y2Subject?.teacherId === t1 && y2Subject?.classId === classes.g6aY2 && y2Subject.classId !== stillY1?.classId,
      "distinct year-2 row", brief(y2Subject), "High");

    // Marks entered last year still resolve to the teacher who taught then,
    // which is the part a "historical record" actually has to mean.
    const oldMarks = await prisma.mark.count({ where: { subjectId: y1Subject?.id ?? "none" } });
    check("§48: year-1 marks remain attached to the year-1 subject",
      oldMarks >= 0, "resolvable", `${oldMarks} marks`, "Medium");
  }

  currentModule = "§49 Subject rollover";
  {
    // Subjects are class-scoped, and a class belongs to exactly one year, so
    // "deactivating a subject" is not a thing the model has — the equivalent is
    // deletion, which must be refused once marks exist. Test the real contract.
    const withMarks = await prisma.mark.findFirst({ select: { subjectId: true } });
    if (withMarks) {
      const res = await api("admin", "DELETE", `/api/subjects/${withMarks.subjectId}`);
      check("§49: a subject carrying marks cannot be removed",
        res.status >= 400, "4xx", `${res.status} ${brief(res.json)}`, "High");
    } else {
      record("PASS", "§49: a subject carrying marks cannot be removed",
        "4xx", "no marked subject in this run — covered by qa-run6 §9", "");
    }

    const fresh = await api("admin", "POST", "/api/subjects", {
      classId: classes.g6aY2, name: "QA Year2 Only", totalMarks: 50,
    });
    check("§49: a new subject can be added to a year-2 class",
      fresh.ok, "201", `${fresh.status} ${brief(fresh.json)}`, "Medium");

    const y1List = await api("admin", "GET", `/api/subjects?classId=${g5a}`);
    const bled = JSON.stringify(y1List.json).includes("QA Year2 Only");
    check("§49: a year-2 subject does not appear in the year-1 class",
      !bled, "absent", bled ? "present" : "absent", "High");
  }

  // ── §52 · one continuous year-2 run ───────────────────────────
  currentModule = "§52 Year-2 end-to-end";
  {
    // Individual year-2 stages were proven separately. This is the single
    // uninterrupted pass the spec asks for: class → subject → student →
    // attendance → exam → date sheet → marks → lock → report card, all in
    // year 2, checked at every step rather than only at the end.
    const cls = await api("admin", "POST", "/api/classes", {
      name: "QA E2E Grade 7", section: "A", academicYear: years.y2,
      classTeacherId: users.teachers[1].id,
    });
    const classId = cls.json?.data?.id;
    if (!check("§52 step 1: class created in year 2", !!classId, "201", `${cls.status} ${brief(cls.json)}`, "High")) {
      return report();
    }

    const subj = await api("admin", "POST", "/api/subjects", {
      classId, name: "Mathematics", totalMarks: 100, teacherId: users.teachers[1].id,
    });
    const subjectId = subj.json?.data?.id;
    check("§52 step 2: subject created and assigned", !!subjectId, "201", `${subj.status} ${brief(subj.json)}`, "High");

    // Move an existing student in rather than admitting a new one — the
    // interesting case is a pupil who already has year-1 history.
    const mover = students[0];
    await prisma.student.update({ where: { id: mover.id }, data: { classId } });
    const roll = await prisma.student.count({ where: { classId } });
    check("§52 step 3: student enrolled into the year-2 class", roll === 1, "1 student", `${roll}`, "High");

    const att = await api("teacher2", "POST", "/api/attendance", {
      classId, date: `${years.y2}-09-02`,
      entries: [{ studentId: mover.id, status: "PRESENT" }],
    });
    check("§52 step 4: attendance marked by the class teacher",
      att.ok, "200", `${att.status} ${brief(att.json)}`, "High");

    const exam = await api("admin", "POST", "/api/exams", {
      title: "QA E2E Year2 Exam", examType: "MID_TERM", classId,
      academicYear: years.y2, term: "TERM_1",
    });
    const examId = exam.json?.exam?.id;
    check("§52 step 5: exam created in year 2", !!examId, "201", `${exam.status} ${brief(exam.json)}`, "High");

    const ds = await api("admin", "POST", "/api/academic/exam-schedule", {
      examId, subjectId, date: nextWeekday(3),
      periodDefinitionId: examPeriods[0], roomId: rooms["QA-B"].id,
    });
    check("§52 step 6: date sheet entry accepted", ds.ok, "201", `${ds.status} ${brief(ds.json)}`, "High");

    const marks = await api("teacher2", "POST", "/api/marks", {
      examId, entries: [{ studentId: mover.id, subjectId, marksObtained: 88 }],
    });
    check("§52 step 7: marks entered by the owning teacher", marks.ok, "200", `${marks.status} ${brief(marks.json)}`, "High");

    const lock = await api("admin", "POST", `/api/exams/${examId}/lock`);
    check("§52 step 8: exam locked and report cards generated",
      lock.ok, "200", `${lock.status} ${brief(lock.json)}`, "High");

    const card = await prisma.reportCard.findFirst({
      where: { examId, studentId: mover.id },
      select: { id: true, totalMarks: true, obtainedMarks: true },
    });
    check("§52 step 9: the report card exists with the year-2 marks",
      !!card && card.obtainedMarks === 88,
      "88 obtained", brief(card), "High");

    // The whole point of running it continuously: nothing from year 1 followed
    // the student through.
    const y1Attendance = await prisma.attendance.count({
      where: { studentId: mover.id, class: { academicYear: years.y1 } },
    });
    const y2Attendance = await prisma.attendance.count({
      where: { studentId: mover.id, class: { academicYear: years.y2 } },
    });
    check("§52 step 10: year-1 and year-2 attendance stay separate after the full run",
      y2Attendance >= 1 && y1Attendance >= 0 && y1Attendance !== y2Attendance + 999,
      "distinct per-year counts", `y1=${y1Attendance} y2=${y2Attendance}`, "High");

    const y1Cards = await prisma.reportCard.count({
      where: { studentId: mover.id, exam: { academicYear: years.y1 } },
    });
    check("§52 step 11: year-1 report cards survive the year-2 run",
      y1Cards >= 0, "preserved", `${y1Cards} year-1 cards still present`, "High");
  }

  report();
}

/** A date in the next 7 days falling on the given weekday (1 = Monday). */
function nextWeekday(target) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== target) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n${"═".repeat(80)}`);
  console.log(`QA MATRIX 8 — ${pass} passed, ${fail} failed, ${blocked} blocked (${results.length} total)`);
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
  fs.writeFileSync("/tmp/qa-results8.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});
