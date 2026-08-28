import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  assertStaffRole,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";

// Student life-cycle timeline.
// GET  /api/students/timeline?studentId=   — events (campus-scoped)
// POST /api/students/timeline              — { studentId, kind: "NOTE"|"PROMOTED"|"ADMITTED", title, detail? }

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // The timeline is the school's running commentary on a child — free-text
    // staff notes alongside admission and promotion events. Ungated, any
    // signed-in account could read it for any pupil in the school, and any
    // could append to it.
    await assertModuleRead(user, "students");
    const studentId = req.nextUrl.searchParams.get("studentId");
    if (!studentId) throw new ApiError("studentId required", 400);

    const events = await prisma.studentTimelineEvent.findMany({
      where: { studentId, student: { campus: { schoolId: user.schoolId } } },
      orderBy: [{ createdAt: "desc" }],
    });

    return Response.json({ success: true, data: events });
  } catch (error) {
    return errorResponse(error, "[students/timeline] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    await assertPermission(user, "students", "edit");
    const body = await req.json();
    const { studentId, kind, title, detail } = body as {
      studentId?: string;
      kind?: string;
      title?: string;
      detail?: string;
    };
    if (!studentId) throw new ApiError("studentId is required", 400);
    if (!title || !String(title).trim()) throw new ApiError("title is required", 400);

    const student = await prisma.student.findFirst({
      where: { id: studentId, campus: { schoolId: user.schoolId } },
      select: { id: true },
    });
    if (!student) throw new ApiError("Student not found", 404);

    const event = await prisma.studentTimelineEvent.create({
      data: {
        studentId: student.id,
        kind: String(kind ?? "NOTE").toUpperCase(),
        title: String(title).trim(),
        detail: detail ? String(detail).trim() : null,
        actorId: user.userId,
      },
    });

    return Response.json({ success: true, data: event }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[students/timeline] POST failed");
  }
}