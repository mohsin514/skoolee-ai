import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertStaffRole,
  canLeadAcademics,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

/**
 * SKAI-1346: campus leaders see the whole campus. Anyone else sees history only for
 * classes they teach or lead; null means unrestricted.
 */
async function visibleClassIds(user: Awaited<ReturnType<typeof requireAuthUser>>, campusId: string): Promise<string[] | null> {
  if (await canLeadAcademics(user, campusId)) return null;
  const classes = await prisma.class.findMany({
    where: {
      schoolId: user.schoolId,
      campusId,
      OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }],
    },
    select: { id: true },
  });
  return classes.map((c) => c.id);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Campus-wide academic history — staff only.
    assertStaffRole(user);
    const sp = req.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, sp.get("campusId"));
    const academicYear = Number(sp.get("academicYear"));
    const classId = sp.get("classId");
    const studentId = sp.get("studentId");
    const visible = await visibleClassIds(user, campusId);

    if (studentId) {
      const history = await prisma.studentClassHistory.findMany({
        where: { studentId, campusId, ...(visible ? { classId: { in: visible } } : {}) },
        include: {
          class: { select: { id: true, name: true, section: true } },
          student: { select: { id: true, fullName: true, admissionNo: true, profileImageUrl: true } },
        },
        orderBy: { academicYear: "desc" },
      });

      return Response.json({ success: true, data: history });
    }

    if (classId && academicYear) {
      if (visible && !visible.includes(classId)) throw new ApiError("You are not assigned to this class.", 403);
      const records = await prisma.studentClassHistory.findMany({
        where: { classId, academicYear, campusId },
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              admissionNo: true,
              profileImageUrl: true,
              class: { select: { id: true, name: true, section: true } },
            },
          },
        },
        orderBy: { rollNo: "asc" },
      });

      const classInfo = await prisma.class.findUnique({
        where: { id: classId },
        select: {
          id: true,
          name: true,
          section: true,
          academicYear: true,
          status: true,
          classTeacher: { select: { fullName: true } },
          _count: { select: { exams: true } },
        },
      });

      return Response.json({ success: true, data: { class: classInfo, students: records } });
    }

    if (academicYear) {
      const classes = await prisma.class.findMany({
        where: { campusId, academicYear, ...(visible ? { id: { in: visible } } : {}) },
        select: {
          id: true,
          name: true,
          section: true,
          academicYear: true,
          status: true,
          classTeacher: { select: { fullName: true } },
          _count: { select: { students: true, subjects: true, exams: true } },
        },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      });

      const historySummary = await prisma.studentClassHistory.groupBy({
        by: ["classId", "status"],
        where: { campusId, academicYear },
        _count: true,
      });

      return Response.json({ success: true, data: { classes, historySummary } });
    }

    const years = await prisma.class.findMany({
      where: { campusId },
      select: { academicYear: true, status: true },
    });

    const yearSummary = [...new Set(years.map((y) => y.academicYear))]
      .sort((a, b) => b - a)
      .map((year) => {
        const yearClasses = years.filter((y) => y.academicYear === year);
        return {
          year,
          totalClasses: yearClasses.length,
          completed: yearClasses.filter((c) => c.status === "COMPLETED").length,
          active: yearClasses.filter((c) => c.status === "ACTIVE").length,
        };
      });

    return Response.json({ success: true, data: yearSummary });
  } catch (error) {
    return errorResponse(error, "[academic-year/history] GET failed");
  }
}
