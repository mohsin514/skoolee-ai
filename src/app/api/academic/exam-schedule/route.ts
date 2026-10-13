import { validateStoredExamSchedules } from "@/lib/academic/exam-bookings";
import { withExamSchedulingWrite, resolveExamSchedulingCampus } from "@/lib/academic/exam-scheduling-write";
import { NextRequest } from "next/server";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { studentScope } from "@/lib/auth/policy";
import { ApiError, assertPermission, canManageOperations, errorResponse, isFamilyRole, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { syncPrimaryExamRoom } from "@/lib/academic/exam-rooms";
import { roomCapacity } from "@/lib/academic/room-capacity";

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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Enough of the room to work out its exam-day capacity on the client without
// a second round trip — `capacity` alone is the teaching figure and reading it
// as an exam figure is the bug §79 fixed.
const roomSelect = {
  id: true,
  roomNumber: true,
  capacity: true,
  building: true,
  floor: true,
  wing: true,
  rows: true,
  benchesPerRow: true,
  seatsPerBench: true,
  examSeatsPerBench: true,
  isExamHall: true,
} as const;

const scheduleInclude = {
  subject: { select: { id: true, name: true, totalMarks: true } },
  periodDefinition: { select: { id: true, periodNumber: true, startTime: true, endTime: true } },
  room: { select: roomSelect },
  // §58: the full room set, so the date sheet can show "QA-A + QA-B" rather
  // than only the primary room of a split paper.
  rooms: {
    // The primary room is always created first, so creation order is also
    // invigilation order — no second sort key needed.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      isPrimary: true,
      room: { select: roomSelect },
      _count: { select: { seats: true } },
    },
  },
  exam: {
    select: {
      id: true,
      title: true,
      term: true,
      classId: true,
      sessionId: true,
      examType: true,
      academicYear: true,
      class: { select: { name: true, section: true } },
      _count: { select: { marks: true } },
    },
  },
} as const;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId");
    // The master date sheet is every class's papers at once, which is one
    // query by session rather than one query per class.
    const sessionId = searchParams.get("sessionId");
    const campusId = examId ? await resolveExamSchedulingCampus(user, searchParams.get("campusId"), { kind: "exam", id: examId }) : sessionId ? await resolveExamSchedulingCampus(user, searchParams.get("campusId"), { kind: "session", id: sessionId }) : await resolveCampusId(user, searchParams.get("campusId"));

    // Families see the date sheet for their own class only, and never for an
    // exam the office is still drafting. Without this, any signed-in student
    // could read every class's papers on the campus.
    let audienceScope: Record<string, unknown> = {};
    if (isFamilyRole(user)) {
      const students = await prisma.student.findMany({
        where:
          user.role === "STUDENT"
            ? { studentUserId: user.userId }
            : studentScope(user, "learningRecords"),
        select: { classId: true },
      });
      const classIds = Array.from(new Set(students.map((s) => s.classId)));
      if (classIds.length === 0) return Response.json({ success: true, data: [] });
      audienceScope = { classId: { in: classIds }, status: { not: "DRAFT" } };
    }

    const schedules = await prisma.examSchedule.findMany({
      where: {
        campusId,
        ...(examId ? { examId } : {}),
        // Both the session filter and the family scope narrow `exam`, so they
        // are merged into one object — spreading them separately meant
        // whichever came last silently dropped the other.
        ...(sessionId || Object.keys(audienceScope).length
          ? { exam: { ...(sessionId ? { sessionId } : {}), ...audienceScope } }
          : {}),
      },
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

    const campusId = await resolveExamSchedulingCampus(user, body.campusId, { kind: "exam", id: examId });
    return await withExamSchedulingWrite(user, campusId, "add", async (prisma) => {
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

    return await createOrUpdate(prisma, user.schoolId, exam, subject.name, subjectId, date, periodDefinitionId, roomId, campusId);
    });
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

    const campusId = await resolveExamSchedulingCampus(user, body.campusId, { kind: "schedule", id });
    return await withExamSchedulingWrite(user, campusId, "edit", async (prisma) => {
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
      prisma, user.schoolId, existing.exam,
      existing.subject.name,
      existing.subjectId,
      finalDate,
      finalPeriod,
      finalRoom,
      campusId,
      id
    );
    });
  } catch (error) {
    return errorResponse(error, "[academic/exam-schedule] PATCH failed");
  }
}

async function createOrUpdate(
  db: TxClient, schoolId: string,
  exam: { id: string; classId: string; subjectId: string | null; title: string },
  subjectName: string,
  subjectId: string,
  date: string,
  periodDefinitionId: string | null,
  roomId: string | null,
  campusId: string,
  excludeId?: string
) {
  if (!Number.isFinite(new Date(`${date}T00:00:00Z`).getTime()) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new ApiError("Choose a real calendar date.", 400);
  const currentExam = await db.exam.findFirst({ where: { id: exam.id, schoolId, campusId, class: { archivedAt: null, status: "ACTIVE" }, isLocked: false, status: { in: ["DRAFT", "ACTIVE", "MARKS_ENTRY"] } }, select: { id: true, session: { select: { startDate: true, endDate: true } } } });
  if (!currentExam) throw new ApiError("This exam is no longer editable.", 409);
  if (currentExam.session?.startDate && date < currentExam.session.startDate.toISOString().slice(0, 10) || currentExam.session?.endDate && date > currentExam.session.endDate.toISOString().slice(0, 10)) throw new ApiError("The paper must fall within the session dates.", 409);
  if (roomId) {
    const room = await db.classRoom.findFirst({ where: { id: roomId, campusId, schoolId } });
    if (!room) throw new ApiError("Room not found", 400);
    const allocation = excludeId ? await db.examRoom.count({ where: { examScheduleId: excludeId } }) : 0;
    // Existing multi-room plans retain their full capacity when dates move.
    if (allocation <= 1) {
      const capacity = roomCapacity(room);
      const candidates = await db.student.count({ where: { classId: exam.classId, campusId, status: "active", archivedAt: null } });
      if (!capacity.unmeasured && candidates > capacity.exam) throw new ApiError("This room cannot seat the active candidates at exam spacing. Use the full room allocation editor.", 409);
    }
  }
  const data = {
    date: new Date(`${date}T00:00:00.000Z`),
    periodDefinitionId,
    roomId,
  };

  if (excludeId) {
    const updated = await db.examSchedule.update({
      where: { id: excludeId },
      data,
      include: scheduleInclude,
    });
    await syncPrimaryExamRoom({ db, campusId, scheduleId: updated.id, roomId });
    await validateStoredExamSchedules(db, { schoolId, campusId }, [updated.id]);
    return Response.json({ success: true, data: updated });
  }

  const created = await db.examSchedule.create({
    data: { ...data, campusId, examId: exam.id, subjectId },
    include: scheduleInclude,
  });
  await syncPrimaryExamRoom({ db, campusId, scheduleId: created.id, roomId });
  await validateStoredExamSchedules(db, { schoolId, campusId }, [created.id]);
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

    const campusId = await resolveExamSchedulingCampus(user, searchParams.get("campusId"), { kind: "schedule", id });
    return await withExamSchedulingWrite(user, campusId, "delete", async (prisma) => {
    const existing = await prisma.examSchedule.findFirst({
      where: { id, campusId, campus: { schoolId: user.schoolId } },
      include: { exam: { select: { status: true, isLocked: true } } },
    });
    if (!existing) return Response.json({ error: "Schedule not found" }, { status: 404 });

    if (existing.exam.isLocked || !["DRAFT", "ACTIVE", "MARKS_ENTRY"].includes(existing.exam.status)) throw new ApiError("This exam is no longer editable.", 409);
    await prisma.examSchedule.delete({ where: { id } });
    return Response.json({ success: true });
    });
  } catch (error) {
    return errorResponse(error, "[academic/exam-schedule] DELETE failed");
  }
}
