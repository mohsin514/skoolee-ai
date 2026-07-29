import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { verifyParentToken } from "../token/route";

export const runtime = "nodejs";

async function resolveClassId(req: NextRequest): Promise<string | null> {
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    const result = await verifyParentToken(token);
    if (!result?.studentId) return null;
    const student = await prisma.student.findUnique({
      where: { id: result.studentId },
      select: { classId: true },
    });
    return student?.classId || null;
  }

  const user = await getAuthUser();
  if (!user) return null;

  if (user.role === "PARENT") {
    const student = await prisma.student.findFirst({
      where: { parentUserId: user.userId },
      select: { classId: true },
    });
    return student?.classId || null;
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const classId = await resolveClassId(req);
    if (!classId) {
      return Response.json({ success: true, data: null });
    }

    const timetable = await prisma.timetable.findFirst({
      where: { classId, status: "PUBLISHED" },
      include: {
        class: { select: { name: true, section: true } },
        slots: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, fullName: true } },
          },
          orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
        },
      },
    });

    if (!timetable) {
      return Response.json({ success: true, data: null });
    }

    return Response.json({
      success: true,
      data: {
        className: timetable.class.name,
        classSection: timetable.class.section,
        slots: timetable.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          periodNumber: s.periodNumber,
          startTime: s.startTime,
          endTime: s.endTime,
          slotType: s.slotType,
          subject: s.subject,
          teacher: s.teacher,
          roomNumber: s.roomNumber,
        })),
      },
    });
  } catch {
    return Response.json({ error: "Failed to load timetable" }, { status: 500 });
  }
}
