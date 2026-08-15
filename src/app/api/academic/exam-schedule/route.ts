import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assertPermission, canManageOperations, errorResponse, isFamilyRole, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { findTimetableRoomClashes, syncPrimaryExamRoom } from "@/lib/academic/exam-rooms";

// GET  /api/academic/exam-schedule?examId=&campusId=
// POST /api/academic/exam-schedule { examId, subjectId, date, periodDefinitionId?, roomId? }
// PATCH /api/academic/exam-schedule { id, date?, periodDefinitionId?, roomId? }
// DELETE /api/academic/exam-schedule?id=
//
// Conflict rules (Module 13):
// - A class can't sit two papers at the same time (same date + period definition,
//   different subject, same exam class).
// - A room can't host two papers at the same time (same date + period definition).
// - A subject already scheduled in this exam (unique examId+subjectId) → 409.
// - Scheduling on a campus weekend → 409.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const jsDay = new Date(y, m - 1, d).getDay(); // 0=Sun
  return jsDay === 0 ? 7 : jsDay;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const scheduleInclude = {
  subject: { select: { id: true, name: true, totalMarks: true } },
  periodDefinition: { select: { id: true, periodNumber: true, startTime: true, endTime: true } },
  room: { select: { id: true, roomNumber: true, capacity: true } },
  // §58: the full room set, so the date sheet can show "QA-A + QA-B" rather
  // than only the primary room of a split paper.
  rooms: {
    // The primary room is always created first, so creation order is also
    // invigilation order — no second sort key needed.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      isPrimary: true,
      room: { select: { id: true, roomNumber: true, capacity: true } },
      _count: { select: { seats: true } },
    },
  },
  exam: {
    select: {
      id: true,
      title: true,
      term: true,
      classId: true,
      class: { select: { name: true, section: true } },
    },
  },
} as const;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const examId = searchParams.get("examId");

    // Families see the date sheet for their own class only, and never for an
    // exam the office is still drafting. Without this, any signed-in student
    // could read every class's papers on the campus.
    let audienceScope: Record<string, unknown> = {};
    if (isFamilyRole(user)) {
      const students = await prisma.student.findMany({
        where:
          user.role === "STUDENT"
            ? { studentUserId: user.userId }
            : { parentUserId: user.userId },
        select: { classId: true },
      });
      const classIds = Array.from(new Set(students.map((s) => s.classId)));
      if (classIds.length === 0) return Response.json({ success: true, data: [] });
      audienceScope = { exam: { classId: { in: classIds }, status: { not: "DRAFT" } } };
    }

    const schedules = await prisma.examSchedule.findMany({
      where: { campusId, ...(examId ? { examId } : {}), ...audienceScope },
      include: scheduleInclude,
      orderBy: [{ date: "asc" }, { periodDefinition: { periodNumber: "asc" } }],
    });

    return Response.json({ success: true, data: schedules });
  } catch (error) {
    return errorResponse(error, "[academic/exam-schedule] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "exams", "add");

    const body = await req.json();
    const examId = String(body.examId ?? "");
    const subjectId = String(body.subjectId ?? "");
    const date = String(body.date ?? "");
    const periodDefinitionId = body.periodDefinitionId ? String(body.periodDefinitionId) : null;
    const roomId = body.roomId ? String(body.roomId) : null;

    if (!examId || !subjectId || !date || !DATE_RE.test(date)) {
      return Response.json({ error: "examId, subjectId and date (YYYY-MM-DD) are required" }, { status: 400 });
    }

    const campusId = await resolveCampusId(user, body.campusId);
    const exam = await prisma.exam.findFirst({
      where: { id: examId, campusId, campus: { schoolId: user.schoolId } },
      select: { id: true, classId: true, subjectId: true, title: true },
    });
    if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });

    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, campusId, classId: exam.classId },
      select: { id: true, name: true },
    });
    if (!subject) return Response.json({ error: "Subject does not belong to this exam's class" }, { status: 400 });
    if (exam.subjectId && exam.subjectId !== subjectId) {
      return Response.json({ error: "This exam covers a single subject — schedule that one" }, { status: 400 });
    }

    const dup = await prisma.examSchedule.findUnique({
      where: { examId_subjectId: { examId, subjectId } },
    });
    if (dup) return Response.json({ error: `${subject.name} is already scheduled in this exam` }, { status: 409 });

    return await createOrUpdate(exam, subject.name, subjectId, date, periodDefinitionId, roomId, campusId);
  } catch (error) {
    return errorResponse(error, "[academic/exam-schedule] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "exams", "edit");

    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const campusId = await resolveCampusId(user, body.campusId);
    const existing = await prisma.examSchedule.findFirst({
      where: { id, campusId, campus: { schoolId: user.schoolId } },
      include: {
        subject: { select: { name: true } },
        exam: { select: { id: true, classId: true, subjectId: true, title: true } },
      },
    });
    if (!existing) return Response.json({ error: "Schedule not found" }, { status: 404 });

    const date = body.date !== undefined ? String(body.date) : undefined;
    if (date !== undefined && !DATE_RE.test(date)) {
      return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }
    const periodDefinitionId = body.periodDefinitionId !== undefined ? (body.periodDefinitionId ? String(body.periodDefinitionId) : null) : undefined;
    const roomId = body.roomId !== undefined ? (body.roomId ? String(body.roomId) : null) : undefined;

    const finalDate = date ?? isoDate(existing.date);
    const finalPeriod = periodDefinitionId !== undefined ? periodDefinitionId : existing.periodDefinitionId;
    const finalRoom = roomId !== undefined ? roomId : existing.roomId;

    return await createOrUpdate(
      existing.exam,
      existing.subject.name,
      existing.subjectId,
      finalDate,
      finalPeriod,
      finalRoom,
      campusId,
      id
    );
  } catch (error) {
    return errorResponse(error, "[academic/exam-schedule] PATCH failed");
  }
}

async function createOrUpdate(
  exam: { id: string; classId: string; subjectId: string | null; title: string },
  subjectName: string,
  subjectId: string,
  date: string,
  periodDefinitionId: string | null,
  roomId: string | null,
  campusId: string,
  excludeId?: string
) {
  let periodTimes: { startTime: string; endTime: string } | null = null;
  if (periodDefinitionId) {
    const periodDef = await prisma.periodDefinition.findFirst({
      where: { id: periodDefinitionId, campusId, timeType: "EXAM" },
    });
    if (!periodDef) return Response.json({ error: "Period definition not found or not an EXAM period" }, { status: 400 });
    periodTimes = { startTime: periodDef.startTime, endTime: periodDef.endTime };
  }
  if (roomId) {
    const room = await prisma.classRoom.findFirst({ where: { id: roomId, campusId } });
    if (!room) return Response.json({ error: "Room not found" }, { status: 400 });

    // Seating an exam in a room that cannot hold the class is an operational
    // failure on the day, so it is blocked rather than warned about. capacity 0
    // means "not recorded" and is left alone.
    if (room.capacity > 0) {
      const seated = await prisma.student.count({ where: { classId: exam.classId, campusId } });
      if (seated > room.capacity) {
        return Response.json(
          {
            error: `Capacity conflict: ${seated} students are sitting this paper but Room ${room.roomNumber} holds only ${room.capacity}. Pick a larger room, or split the paper across several rooms.`,
            conflict: { type: "ROOM_CAPACITY", seated, capacity: room.capacity, roomNumber: room.roomNumber, shortBy: seated - room.capacity },
          },
          { status: 409 }
        );
      }
    }
  }

  const weekends = await prisma.weekend.findMany({
    where: { campusId },
    select: { dayOfWeek: true },
  });
  const weekendDays = new Set(weekends.map((w) => w.dayOfWeek));
  const day = dayOfWeek(date);
  if (weekendDays.has(day)) {
    const labels = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return Response.json({ error: `${labels[day]} is a campus weekend — pick a working day` }, { status: 409 });
  }

  // A class can't sit two papers at the same time.
  const classClash = await prisma.examSchedule.findFirst({
    where: {
      campusId,
      exam: { classId: exam.classId },
      date: new Date(`${date}T00:00:00.000Z`),
      periodDefinitionId,
      id: { not: excludeId || "____" },
    },
    include: { subject: { select: { name: true } }, exam: { select: { title: true } } },
  });
  if (classClash) {
    return Response.json(
      { error: `${exam.title}: ${subjectName} clashes with ${classClash.subject.name} — this class already has a paper in that time slot` },
      { status: 409 }
    );
  }

  // A room can't host two papers at the same time. Since §58 a paper can hold
  // several rooms, so the search has to go through ExamRoom — checking only the
  // primary `roomId` would miss every overflow room of a split paper.
  if (roomId && periodDefinitionId) {
    const roomClash = await prisma.examRoom.findFirst({
      where: {
        campusId,
        roomId,
        examScheduleId: { not: excludeId || "____" },
        examSchedule: { date: new Date(`${date}T00:00:00.000Z`), periodDefinitionId },
      },
      include: {
        room: { select: { roomNumber: true } },
        examSchedule: {
          include: { subject: { select: { name: true } }, exam: { select: { title: true } } },
        },
      },
    });
    if (roomClash) {
      return Response.json(
        { error: `Room ${roomClash.room.roomNumber} is already hosting ${roomClash.examSchedule.exam.title} (${roomClash.examSchedule.subject.name}) in that time slot` },
        { status: 409 }
      );
    }
  }

  // §72: the room may be free of other papers and still be occupied by a
  // timetabled lesson at that hour.
  if (roomId && periodTimes) {
    const lessonClashes = await findTimetableRoomClashes({
      campusId,
      roomIds: [roomId],
      date,
      startTime: periodTimes.startTime,
      endTime: periodTimes.endTime,
    });
    if (lessonClashes.length) {
      return Response.json({ error: lessonClashes[0] }, { status: 409 });
    }
  }

  const data = {
    date: new Date(`${date}T00:00:00.000Z`),
    periodDefinitionId,
    roomId,
  };

  if (excludeId) {
    const updated = await prisma.examSchedule.update({
      where: { id: excludeId },
      data,
      include: scheduleInclude,
    });
    await syncPrimaryExamRoom({ campusId, scheduleId: updated.id, roomId });
    return Response.json({ success: true, data: updated });
  }

  const created = await prisma.examSchedule.create({
    data: { ...data, campusId, examId: exam.id, subjectId },
    include: scheduleInclude,
  });
  await syncPrimaryExamRoom({ campusId, scheduleId: created.id, roomId });
  return Response.json({ success: true, data: created }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "exams", "delete");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const existing = await prisma.examSchedule.findFirst({
      where: { id, campusId, campus: { schoolId: user.schoolId } },
    });
    if (!existing) return Response.json({ error: "Schedule not found" }, { status: 404 });

    await prisma.examSchedule.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[academic/exam-schedule] DELETE failed");
  }
}
