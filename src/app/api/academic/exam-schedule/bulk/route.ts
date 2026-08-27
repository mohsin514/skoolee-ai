import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { BulkConflict } from "@/lib/academic/exam-conflicts";
import {
  ApiError,
  assertPermission,
  assertStaffRole,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

/**
 * Master date sheet: one subject, every class, one action (§80).
 *
 * A school does not decide "Class 5 sits maths on the 12th" twenty times over.
 * It decides "maths is on the 12th, period 1" and every class that takes maths
 * sits it then. Doing that class by class was twenty forms, and — because each
 * form only checked itself — the twentieth could clash with the first with
 * nothing to say so until the morning of the exam.
 *
 * GET  ?sessionId=  → the planning grid: every class, every subject, where it
 *                     currently sits, and every conflict across the whole
 *                     session in one pass.
 * POST { sessionId, subjectName, date, periodDefinitionId, mode }
 *      → place (or move) that subject for every class in the session.
 *        mode="check" validates and changes nothing.
 *
 * The difference from the single-paper route is not the writing, it is the
 * checking: conflicts are collected for ALL classes and returned together, so
 * an admin fixes a clash once instead of discovering the next one after each
 * save.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const jsDay = new Date(y, m - 1, d).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function classLabelOf(c: { name: string; section: string | null }) {
  return `${c.name}${c.section ? ` ${c.section}` : ""}`;
}

/** Weekend and holiday days for a campus, as a lookup. */
async function calendarBlocks(campusId: string) {
  const [weekends, holidays] = await Promise.all([
    prisma.weekend.findMany({ where: { campusId }, select: { dayOfWeek: true } }),
    prisma.holiday.findMany({
      where: { campusId },
      select: { name: true, fromDate: true, toDate: true },
    }),
  ]);
  const weekendDays = new Set(weekends.map((w) => w.dayOfWeek));
  const holidayFor = (date: string) => {
    const d = new Date(`${date}T00:00:00.000Z`);
    return holidays.find((h) => d >= h.fromDate && d <= h.toDate) ?? null;
  };
  return { weekendDays, holidayFor };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (!sessionId) throw new ApiError("sessionId is required", 400);

    const session = await prisma.examSession.findFirst({
      where: { id: sessionId, campusId },
      select: { id: true, title: true, startDate: true, endDate: true },
    });
    if (!session) throw new ApiError("Exam session not found", 404);

    const exams = await prisma.exam.findMany({
      where: { sessionId, campusId },
      orderBy: [{ class: { name: "asc" } }, { class: { section: "asc" } }],
      select: {
        id: true,
        classId: true,
        class: {
          select: {
            name: true,
            section: true,
            subjects: {
              orderBy: { name: "asc" },
              select: { id: true, name: true, totalMarks: true },
            },
            _count: { select: { students: true } },
          },
        },
        schedules: {
          select: {
            id: true,
            subjectId: true,
            date: true,
            periodDefinitionId: true,
            roomId: true,
            _count: { select: { seats: true, rooms: true } },
          },
        },
      },
    });

    // Subjects are per class, but a date sheet is built per subject NAME —
    // "Mathematics" is one paper slot even though every class owns its own
    // Subject row. Grouping by name is what makes one action cover the school.
    const subjectNames = new Map<string, { name: string; classIds: string[] }>();
    for (const exam of exams) {
      for (const subject of exam.class.subjects) {
        const key = subject.name.trim().toLowerCase();
        const entry = subjectNames.get(key) ?? { name: subject.name, classIds: [] };
        entry.classIds.push(exam.classId);
        subjectNames.set(key, entry);
      }
    }

    const { weekendDays, holidayFor } = await calendarBlocks(campusId);

    const rows = exams.map((exam) => {
      const byId = new Map(exam.schedules.map((s) => [s.subjectId, s]));
      return {
        examId: exam.id,
        classId: exam.classId,
        classLabel: classLabelOf(exam.class),
        studentCount: exam.class._count.students,
        papers: exam.class.subjects.map((subject) => {
          const sched = byId.get(subject.id);
          return {
            subjectId: subject.id,
            subjectName: subject.name,
            totalMarks: subject.totalMarks,
            scheduleId: sched?.id ?? null,
            date: sched ? sched.date.toISOString().slice(0, 10) : null,
            periodDefinitionId: sched?.periodDefinitionId ?? null,
            roomCount: sched?._count.rooms ?? 0,
            seatCount: sched?._count.seats ?? 0,
          };
        }),
      };
    });

    // Session-wide conflicts, found once rather than per save.
    const conflicts: BulkConflict[] = [];
    const slotUsage = new Map<string, { classLabel: string; subject: string }[]>();
    for (const row of rows) {
      for (const paper of row.papers) {
        if (!paper.date) continue;
        const day = dayOfWeek(paper.date);
        if (weekendDays.has(day)) {
          conflicts.push({
            classLabel: row.classLabel,
            subject: paper.subjectName,
            kind: "WEEKEND",
            message: `${paper.subjectName} falls on ${WEEKDAY[day]}, a campus weekend`,
            blocking: true,
          });
        }
        const holiday = holidayFor(paper.date);
        if (holiday) {
          conflicts.push({
            classLabel: row.classLabel,
            subject: paper.subjectName,
            kind: "HOLIDAY",
            message: `${paper.subjectName} falls inside "${holiday.name}"`,
            blocking: true,
          });
        }
        if (session.startDate && paper.date < session.startDate.toISOString().slice(0, 10)) {
          conflicts.push({
            classLabel: row.classLabel,
            subject: paper.subjectName,
            kind: "OUTSIDE_WINDOW",
            message: `${paper.subjectName} is before the session's start date`,
            blocking: false,
          });
        }
        if (session.endDate && paper.date > session.endDate.toISOString().slice(0, 10)) {
          conflicts.push({
            classLabel: row.classLabel,
            subject: paper.subjectName,
            kind: "OUTSIDE_WINDOW",
            message: `${paper.subjectName} is after the session's end date`,
            blocking: false,
          });
        }
        if (paper.roomCount === 0) {
          conflicts.push({
            classLabel: row.classLabel,
            subject: paper.subjectName,
            kind: "NO_ROOM",
            message: `${paper.subjectName} has no room assigned yet`,
            blocking: false,
          });
        }

        const key = `${row.classId}|${paper.date}|${paper.periodDefinitionId ?? "any"}`;
        const bucket = slotUsage.get(key) ?? [];
        bucket.push({ classLabel: row.classLabel, subject: paper.subjectName });
        slotUsage.set(key, bucket);
      }
    }

    for (const [, entries] of slotUsage) {
      if (entries.length > 1) {
        conflicts.push({
          classLabel: entries[0].classLabel,
          subject: entries.map((e) => e.subject).join(" + "),
          kind: "CLASS_DOUBLE_BOOKED",
          message: `${entries[0].classLabel} has ${entries.length} papers in the same slot: ${entries
            .map((e) => e.subject)
            .join(", ")}`,
          blocking: true,
        });
      }
    }

    const periods = await prisma.periodDefinition.findMany({
      where: { campusId, timeType: "EXAM" },
      orderBy: { periodNumber: "asc" },
      select: { id: true, periodNumber: true, startTime: true, endTime: true },
    });

    return Response.json({
      success: true,
      data: {
        session: {
          id: session.id,
          title: session.title,
          startDate: session.startDate?.toISOString().slice(0, 10) ?? null,
          endDate: session.endDate?.toISOString().slice(0, 10) ?? null,
        },
        rows,
        subjects: [...subjectNames.values()].sort((a, b) => a.name.localeCompare(b.name)),
        periods,
        weekends: [...weekendDays],
        conflicts,
      },
    });
  } catch (error) {
    return errorResponse(error, "[exam-schedule/bulk] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "exams", "edit");

    const body = await req.json();
    const sessionId = String(body.sessionId ?? "");
    const subjectName = String(body.subjectName ?? "").trim();
    const date = String(body.date ?? "");
    const periodDefinitionId = body.periodDefinitionId ? String(body.periodDefinitionId) : null;
    const dryRun = body.mode === "check";
    // Which classes to touch. Omitted = every class in the session that takes
    // this subject, which is the whole point of the screen.
    const onlyClassIds: string[] | null = Array.isArray(body.classIds)
      ? body.classIds.map(String)
      : null;

    if (!sessionId || !subjectName) throw new ApiError("sessionId and subjectName are required", 400);
    if (!DATE_RE.test(date)) throw new ApiError("date must be YYYY-MM-DD", 400);

    const campusId = await resolveCampusId(user, body.campusId);
    const session = await prisma.examSession.findFirst({
      where: { id: sessionId, campusId },
      select: { id: true },
    });
    if (!session) throw new ApiError("Exam session not found", 404);

    const conflicts: BulkConflict[] = [];

    const { weekendDays, holidayFor } = await calendarBlocks(campusId);
    const day = dayOfWeek(date);
    if (weekendDays.has(day)) {
      conflicts.push({
        classLabel: null,
        subject: subjectName,
        kind: "WEEKEND",
        message: `${WEEKDAY[day]} is a campus weekend — pick a working day`,
        blocking: true,
      });
    }
    const holiday = holidayFor(date);
    if (holiday) {
      conflicts.push({
        classLabel: null,
        subject: subjectName,
        kind: "HOLIDAY",
        message: `That date is inside "${holiday.name}"`,
        blocking: true,
      });
    }

    const exams = await prisma.exam.findMany({
      where: {
        sessionId,
        campusId,
        ...(onlyClassIds ? { classId: { in: onlyClassIds } } : {}),
      },
      select: {
        id: true,
        classId: true,
        class: {
          select: {
            name: true,
            section: true,
            subjects: { select: { id: true, name: true } },
          },
        },
        schedules: {
          select: { id: true, subjectId: true, date: true, periodDefinitionId: true },
        },
      },
    });

    const wanted = subjectName.toLowerCase();
    const targets: { examId: string; classLabel: string; subjectId: string; scheduleId: string | null }[] = [];

    for (const exam of exams) {
      const subject = exam.class.subjects.find((s) => s.name.trim().toLowerCase() === wanted);
      if (!subject) continue; // this class does not take the subject — not an error
      const existing = exam.schedules.find((s) => s.subjectId === subject.id);

      // Another paper for this class already occupies the slot.
      const occupied = exam.schedules.find(
        (s) =>
          s.subjectId !== subject.id &&
          s.date.toISOString().slice(0, 10) === date &&
          s.periodDefinitionId === periodDefinitionId,
      );
      if (occupied) {
        const other = exam.class.subjects.find((s) => s.id === occupied.subjectId);
        conflicts.push({
          classLabel: classLabelOf(exam.class),
          subject: subjectName,
          kind: "CLASS_DOUBLE_BOOKED",
          message: `${classLabelOf(exam.class)} already sits ${other?.name ?? "another paper"} in that slot`,
          blocking: true,
        });
        continue;
      }

      targets.push({
        examId: exam.id,
        classLabel: classLabelOf(exam.class),
        subjectId: subject.id,
        scheduleId: existing?.id ?? null,
      });
    }

    if (targets.length === 0 && conflicts.length === 0) {
      throw new ApiError(`No class in this session takes "${subjectName}"`, 400);
    }

    const blocking = conflicts.filter((c) => c.blocking);
    if (dryRun || blocking.length > 0) {
      return Response.json(
        {
          success: blocking.length === 0,
          // A refused save has to say what refused it. Without this the client
          // received a 409 carrying only `data`, and reported the generic
          // "could not place the paper" instead of naming the clash.
          ...(blocking.length > 0 && !dryRun ? { error: blocking[0].message } : {}),
          data: {
            wouldPlace: targets.map((t) => t.classLabel),
            wouldMove: targets.filter((t) => t.scheduleId).length,
            conflicts,
          },
        },
        { status: blocking.length > 0 && !dryRun ? 409 : 200 },
      );
    }

    const dateValue = new Date(`${date}T00:00:00.000Z`);
    await prisma.$transaction(async (tx) => {
      for (const t of targets) {
        if (t.scheduleId) {
          await tx.examSchedule.update({
            where: { id: t.scheduleId },
            data: { date: dateValue, periodDefinitionId },
          });
        } else {
          await tx.examSchedule.create({
            data: {
              campusId,
              examId: t.examId,
              subjectId: t.subjectId,
              date: dateValue,
              periodDefinitionId,
            },
          });
        }
      }
    });

    return Response.json({
      success: true,
      data: {
        placed: targets.length,
        classes: targets.map((t) => t.classLabel),
        conflicts,
      },
    });
  } catch (error) {
    return errorResponse(error, "[exam-schedule/bulk] POST failed");
  }
}

/** Remove a subject's paper from every class in the session. */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "exams", "delete");

    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const subjectName = (req.nextUrl.searchParams.get("subjectName") ?? "").trim();
    if (!sessionId || !subjectName) {
      throw new ApiError("sessionId and subjectName are required", 400);
    }
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const schedules = await prisma.examSchedule.findMany({
      where: {
        campusId,
        exam: { sessionId },
        subject: { name: { equals: subjectName, mode: "insensitive" } },
      },
      select: { id: true },
    });

    if (schedules.length) {
      await prisma.examSchedule.deleteMany({ where: { id: { in: schedules.map((s) => s.id) } } });
    }

    return Response.json({ success: true, data: { removed: schedules.length } });
  } catch (error) {
    return errorResponse(error, "[exam-schedule/bulk] DELETE failed");
  }
}
