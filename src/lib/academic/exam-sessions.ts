import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { roomCapacity } from "@/lib/academic/room-capacity";
import { allocateExamRooms, suggestRooms } from "@/lib/academic/exam-rooms";

/**
 * Exam sessions (§80) — scheduling for every class in one action.
 *
 * The question this answers is "do we schedule one exam for all classes, or a
 * separate exam per class?", and the honest answer is *both, at different
 * levels*:
 *
 *   • The DECISION is school-wide. A school holds mid-terms once, for a list
 *     of classes, in a window. Typing that decision out twenty times — once
 *     per class — was the old flow, and every repetition was a chance to
 *     misspell a title or forget a section, which silently dropped a class off
 *     the date sheet.
 *
 *   • The PAPERS are per class. Class 5 does not sit Class 9's maths paper, on
 *     Class 9's date, in Class 9's room, marked by Class 9's teacher. Merging
 *     those would break marks, report cards and every existing reader.
 *
 * So a session is the decision, and it creates one ordinary `Exam` per class.
 * Nothing downstream of `Exam` had to change.
 */

/** What the office may actually run. Quizzes and class tests are teachers'. */
export const SESSION_EXAM_TYPES = ["MID_TERM", "FINAL"] as const;
export type SessionExamType = (typeof SESSION_EXAM_TYPES)[number];

export interface SessionSummary {
  id: string;
  title: string;
  term: string;
  academicYear: number;
  examType: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  classCount: number;
  /** Papers placed on the date sheet across every class in the session. */
  papersScheduled: number;
  /** Papers that still need a date. */
  papersExpected: number;
  /** Papers with a full seating plan. */
  papersSeated: number;
  studentCount: number;
  marksEntered: number;
  marksExpected: number;
  publishedCount: number;
  firstDate: string | null;
  lastDate: string | null;
  classes: {
    examId: string;
    classId: string;
    className: string;
    section: string | null;
    status: string;
    subjectCount: number;
    studentCount: number;
    scheduled: number;
    seated: number;
    marksEntered: number;
    marksExpected: number;
    totalMarks: number;
  }[];
}

function ymd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Create the session and its per-class exams in one transaction.
 *
 * Classes that already have an exam of this type in this term are skipped
 * rather than duplicated — running the wizard twice after adding a class
 * should add the missing class, not a second paper set for the other nineteen.
 */
export async function createExamSession(opts: {
  schoolId: string;
  campusId: string;
  userId: string;
  title: string;
  term: string;
  academicYear: number;
  examType: string;
  classIds: string[];
  startDate: string | null;
  endDate: string | null;
  notes?: string | null;
}) {
  const { campusId, classIds } = opts;

  if (!(SESSION_EXAM_TYPES as readonly string[]).includes(opts.examType)) {
    throw new ApiError(
      "An exam session can only be a mid-term or a final. Quizzes and class tests are created by teachers for their own class.",
      400,
    );
  }
  if (!opts.title.trim()) throw new ApiError("Give the exam session a title", 400);
  if (!classIds.length) throw new ApiError("Pick at least one class", 400);
  if (opts.startDate && opts.endDate && opts.endDate < opts.startDate) {
    throw new ApiError("The end date is before the start date", 400);
  }

  const classes = await prisma.class.findMany({
    where: { id: { in: classIds }, campusId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      section: true,
      subjects: { select: { totalMarks: true } },
    },
  });
  if (classes.length === 0) throw new ApiError("None of those classes are on this campus", 404);

  const withoutSubjects = classes.filter((c) => c.subjects.length === 0);
  if (withoutSubjects.length === classes.length) {
    throw new ApiError(
      `${withoutSubjects.map((c) => c.name).join(", ")} ${withoutSubjects.length === 1 ? "has" : "have"} no subjects yet, so there are no papers to schedule. Add subjects first.`,
      400,
    );
  }

  // Never create a second copy of an exam a class already has this term.
  const existing = await prisma.exam.findMany({
    where: {
      campusId,
      classId: { in: classes.map((c) => c.id) },
      term: opts.term,
      academicYear: opts.academicYear,
      examType: opts.examType,
    },
    select: { classId: true },
  });
  const alreadyHas = new Set(existing.map((e) => e.classId));

  const toCreate = classes.filter((c) => !alreadyHas.has(c.id) && c.subjects.length > 0);

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.examSession.create({
      data: {
        campusId,
        title: opts.title.trim(),
        term: opts.term,
        academicYear: opts.academicYear,
        examType: opts.examType,
        startDate: opts.startDate ? new Date(`${opts.startDate}T00:00:00.000Z`) : null,
        endDate: opts.endDate ? new Date(`${opts.endDate}T00:00:00.000Z`) : null,
        notes: opts.notes?.trim() || null,
        createdBy: opts.userId,
        status: "PLANNING",
      },
    });

    if (toCreate.length) {
      await tx.exam.createMany({
        data: toCreate.map((c) => ({
          campusId,
          classId: c.id,
          sessionId: created.id,
          title: opts.title.trim(),
          term: opts.term,
          academicYear: opts.academicYear,
          examType: opts.examType,
          totalMarks: c.subjects.reduce((sum, s) => sum + s.totalMarks, 0),
          status: "ACTIVE",
          activatedAt: new Date(),
        })),
      });
    }

    return created;
  });

  return {
    session,
    created: toCreate.length,
    skipped: classes.filter((c) => alreadyHas.has(c.id)).map((c) => `${c.name}${c.section ? ` ${c.section}` : ""}`),
    noSubjects: withoutSubjects.map((c) => `${c.name}${c.section ? ` ${c.section}` : ""}`),
  };
}

/** Everything the planner needs about one session, in a single query set. */
export async function getSessionSummary(
  campusId: string,
  sessionId: string,
): Promise<SessionSummary | null> {
  const session = await prisma.examSession.findFirst({
    where: { id: sessionId, campusId },
    include: {
      exams: {
        orderBy: [{ class: { name: "asc" } }, { class: { section: "asc" } }],
        select: {
          id: true,
          classId: true,
          status: true,
          totalMarks: true,
          class: {
            select: {
              name: true,
              section: true,
              _count: { select: { subjects: true, students: true } },
            },
          },
          schedules: {
            select: {
              id: true,
              date: true,
              _count: { select: { seats: true } },
            },
          },
          _count: { select: { marks: true } },
        },
      },
    },
  });
  if (!session) return null;

  const classes = session.exams.map((e) => {
    const subjectCount = e.class._count.subjects;
    const studentCount = e.class._count.students;
    return {
      examId: e.id,
      classId: e.classId,
      className: e.class.name,
      section: e.class.section,
      status: e.status,
      subjectCount,
      studentCount,
      scheduled: e.schedules.length,
      seated: e.schedules.filter((s) => s._count.seats > 0).length,
      marksEntered: e._count.marks,
      marksExpected: subjectCount * studentCount,
      totalMarks: e.totalMarks,
    };
  });

  const allDates = session.exams
    .flatMap((e) => e.schedules.map((s) => s.date.toISOString().slice(0, 10)))
    .sort();

  return {
    id: session.id,
    title: session.title,
    term: session.term,
    academicYear: session.academicYear,
    examType: session.examType,
    startDate: ymd(session.startDate),
    endDate: ymd(session.endDate),
    status: session.status,
    notes: session.notes,
    createdAt: session.createdAt.toISOString(),
    classCount: classes.length,
    papersScheduled: classes.reduce((n, c) => n + c.scheduled, 0),
    papersExpected: classes.reduce((n, c) => n + c.subjectCount, 0),
    papersSeated: classes.reduce((n, c) => n + c.seated, 0),
    studentCount: classes.reduce((n, c) => n + c.studentCount, 0),
    marksEntered: classes.reduce((n, c) => n + c.marksEntered, 0),
    marksExpected: classes.reduce((n, c) => n + c.marksExpected, 0),
    publishedCount: classes.filter((c) => c.status === "PUBLISHED").length,
    firstDate: allDates[0] ?? null,
    lastDate: allDates[allDates.length - 1] ?? null,
    classes,
  };
}

export async function listSessions(campusId: string, academicYear?: number) {
  const sessions = await prisma.examSession.findMany({
    where: { campusId, ...(academicYear ? { academicYear } : {}) },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  const summaries = await Promise.all(
    sessions.map((s) => getSessionSummary(campusId, s.id)),
  );
  return summaries.filter(Boolean) as SessionSummary[];
}

/**
 * Seat every unseated paper in the session, room by room.
 *
 * Runs paper by paper rather than as one giant solve: each paper is an
 * independent constraint problem once the date sheet is fixed, and a per-paper
 * loop means one impossible paper reports itself by name instead of failing
 * the whole session with nothing to act on.
 */
export async function autoSeatSession(opts: {
  campusId: string;
  sessionId: string;
  /** Re-seat papers that already have rooms. Off by default: a plan an admin
   *  arranged by hand should not be silently rearranged. */
  includeSeated?: boolean;
}) {
  const { campusId, sessionId } = opts;

  const schedules = await prisma.examSchedule.findMany({
    where: { campusId, exam: { sessionId } },
    orderBy: [{ date: "asc" }, { periodDefinition: { periodNumber: "asc" } }],
    select: {
      id: true,
      date: true,
      periodDefinitionId: true,
      subject: { select: { name: true } },
      exam: { select: { classId: true, class: { select: { name: true, section: true } } } },
      _count: { select: { seats: true, rooms: true } },
    },
  });

  const results: {
    scheduleId: string;
    label: string;
    ok: boolean;
    /** Left as it was, rather than seated by this run. */
    skipped?: boolean;
    message: string;
  }[] = [];

  for (const s of schedules) {
    const label = `${s.exam.class.name}${s.exam.class.section ? ` ${s.exam.class.section}` : ""} — ${s.subject.name}`;

    if (!opts.includeSeated && s._count.rooms > 0) {
      results.push({
        scheduleId: s.id,
        label,
        ok: true,
        skipped: true,
        message: "Already has rooms — left alone",
      });
      continue;
    }
    if (!s.periodDefinitionId) {
      results.push({
        scheduleId: s.id,
        label,
        ok: false,
        message: "No exam period set, so the room cannot be checked for clashes",
      });
      continue;
    }

    const headcount = await prisma.student.count({
      where: { classId: s.exam.classId, campusId, status: "active" },
    });
    if (headcount === 0) {
      results.push({ scheduleId: s.id, label, ok: false, message: "No active students in this class" });
      continue;
    }

    const suggestion = await suggestRooms({
      campusId,
      date: s.date.toISOString().slice(0, 10),
      periodDefinitionId: s.periodDefinitionId,
      headcount,
      excludeScheduleId: s.id,
    });

    if (suggestion.short > 0) {
      results.push({
        scheduleId: s.id,
        label,
        ok: false,
        message: `${headcount} candidates but only ${suggestion.capacity} exam seats free in that slot — ${suggestion.short} short`,
      });
      continue;
    }

    try {
      await allocateExamRooms({ campusId, scheduleId: s.id, roomIds: suggestion.roomIds });
      results.push({
        scheduleId: s.id,
        label,
        ok: true,
        message: `Seated ${headcount} in ${suggestion.roomIds.length} room${suggestion.roomIds.length === 1 ? "" : "s"}`,
      });
    } catch (error) {
      results.push({
        scheduleId: s.id,
        label,
        ok: false,
        message: error instanceof Error ? error.message : "Allocation failed",
      });
    }
  }

  return {
    total: results.length,
    // Papers this run actually put into rooms. Ones already seated by hand are
    // reported separately: counting them as "filled" would make a second run
    // claim work it deliberately did not do.
    seated: results.filter((r) => r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => !r.ok),
    results,
  };
}

/** Campus-wide exam seat supply, for the "can we even fit everyone?" panel. */
export async function campusSeatingCapacity(campusId: string) {
  const rooms = await prisma.classRoom.findMany({
    where: { campusId },
    select: {
      id: true,
      roomNumber: true,
      capacity: true,
      rows: true,
      benchesPerRow: true,
      seatsPerBench: true,
      examSeatsPerBench: true,
      isExamHall: true,
      building: true,
      floor: true,
    },
  });

  let exam = 0;
  let teaching = 0;
  let unmeasured = 0;
  for (const r of rooms) {
    const cap = roomCapacity(r);
    if (cap.unmeasured) unmeasured += 1;
    exam += cap.exam;
    teaching += cap.teaching;
  }

  return { rooms: rooms.length, examSeats: exam, teachingSeats: teaching, unmeasured };
}
