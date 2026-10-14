import { withExamSchedulingWrite, resolveExamSchedulingCampus } from "@/lib/academic/exam-scheduling-write";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertPermission,
  assertSharedModuleRead,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { createExamSession, listSessions } from "@/lib/academic/exam-sessions";

// GET    /api/academic/exam-sessions?campusId=&academicYear=
// POST   /api/academic/exam-sessions { title, term, academicYear, examType, classIds[], startDate?, endDate?, notes? }
// PATCH  /api/academic/exam-sessions { id, title?, startDate?, endDate?, status?, notes? }
// DELETE /api/academic/exam-sessions?id=
//
// A session is one school-wide exam announcement that owns a per-class Exam
// row for every class sitting it (§80).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const s = String(value);
  if (!DATE_RE.test(s) || !Number.isFinite(new Date(`${s}T00:00:00Z`).getTime()) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw new ApiError(`${field} must be YYYY-MM-DD`, 400);
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertSharedModuleRead(user, "exams");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));
    const rawYear = req.nextUrl.searchParams.get("academicYear");
    const academicYear = rawYear && /^\d{4}$/.test(rawYear) ? Number(rawYear) : undefined;

    return Response.json({ success: true, data: await listSessions(campusId, academicYear) });
  } catch (error) {
    return errorResponse(error, "[exam-sessions] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "exams", "add");

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    return await withExamSchedulingWrite(user, campusId, "add", async (prisma) => {

    const result = await createExamSession({
      db: prisma,      schoolId: user.schoolId,
      campusId,
      userId: user.userId,
      title: String(body.title ?? ""),
      term: String(body.term ?? "").trim() || "Term 1",
      academicYear: Number(body.academicYear) || new Date().getFullYear(),
      examType: String(body.examType ?? ""),
      classIds: Array.isArray(body.classIds) ? body.classIds.map(String) : [],
      startDate: optionalDate(body.startDate, "startDate"),
      endDate: optionalDate(body.endDate, "endDate"),
      notes: body.notes ? String(body.notes) : null,
    });

    return Response.json({ success: true, ...result }, { status: 201 });
    });
  } catch (error) {
    return errorResponse(error, "[exam-sessions] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "exams", "edit");

    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveExamSchedulingCampus(user, body.campusId, { kind: "session", id });
    return await withExamSchedulingWrite(user, campusId, "edit", async (prisma) => {
    const existing = await prisma.examSession.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Exam session not found", 404);

    const startDate =
      body.startDate !== undefined ? optionalDate(body.startDate, "startDate") : undefined;
    const endDate = body.endDate !== undefined ? optionalDate(body.endDate, "endDate") : undefined;

    const finalStart =
      startDate !== undefined ? startDate : existing.startDate?.toISOString().slice(0, 10) ?? null;
    const finalEnd =
      endDate !== undefined ? endDate : existing.endDate?.toISOString().slice(0, 10) ?? null;
    if (finalStart && finalEnd && finalEnd < finalStart) {
      throw new ApiError("The end date is before the start date", 400);
    }

    if (body.status !== undefined && !["PLANNING", "SCHEDULED", "SEATED", "RUNNING", "COMPLETED"].includes(String(body.status))) throw new ApiError("Invalid exam session status", 400);
    if (body.title !== undefined && (!String(body.title).trim() || String(body.title).trim().length > 160)) throw new ApiError("A session title of up to 160 characters is required", 400);
    const schedules = await prisma.examSchedule.findMany({ where: { campusId, exam: { sessionId: id } }, select: { date: true } });
    if (schedules.some(item => finalStart && item.date.toISOString().slice(0, 10) < finalStart || finalEnd && item.date.toISOString().slice(0, 10) > finalEnd)) throw new ApiError("The session dates must include all scheduled papers.", 409);
    const updated = await prisma.examSession.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
        ...(startDate !== undefined
          ? { startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : null }
          : {}),
        ...(endDate !== undefined
          ? { endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null }
          : {}),
        ...(body.status !== undefined ? { status: String(body.status) } : {}),
        ...(body.notes !== undefined ? { notes: String(body.notes).trim() || null } : {}),
      },
    });

    return Response.json({ success: true, data: updated });
    });
  } catch (error) {
    return errorResponse(error, "[exam-sessions] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "exams", "delete");

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);
    const campusId = await resolveExamSchedulingCampus(user, req.nextUrl.searchParams.get("campusId"), { kind: "session", id });
    return await withExamSchedulingWrite(user, campusId, "delete", async (prisma) => {

    const session = await prisma.examSession.findFirst({
      where: { id, campusId },
      select: {
        id: true,
        title: true,
        exams: { select: { id: true, status: true, _count: { select: { marks: true } } } },
      },
    });
    if (!session) throw new ApiError("Exam session not found", 404);

    // Deleting the announcement must never delete a term's marks. Exams that
    // have real work in them are released from the session and left standing;
    // only empty, untouched shells go with it.
    const keptIds = new Set(
      session.exams
        .filter(
          (e) =>
            e._count.marks > 0 ||
            e.status === "PUBLISHED" ||
            e.status === "PRINCIPAL_REVIEWED" ||
            e.status === "LOCKED",
        )
        .map((e) => e.id),
    );
    const empty = session.exams.filter((e) => !keptIds.has(e.id));

    const tx = prisma;
    {
      if (empty.length) {
        await tx.exam.deleteMany({ where: { id: { in: empty.map((e) => e.id) } } });
      }
      await tx.examSession.delete({ where: { id } });
    }

    return Response.json({
      success: true,
      data: { id, removedExams: empty.length, keptExams: keptIds.size },
    });
    });
  } catch (error) {
    return errorResponse(error, "[exam-sessions] DELETE failed");
  }
}
