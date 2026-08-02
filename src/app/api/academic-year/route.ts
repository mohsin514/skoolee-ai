import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const classes = await prisma.class.findMany({
      where: { campusId },
      select: {
        id: true,
        name: true,
        section: true,
        academicYear: true,
        status: true,
        classTeacherId: true,
        classTeacher: { select: { fullName: true } },
        _count: { select: { students: true, subjects: true, exams: true } },
      },
      orderBy: [{ academicYear: "desc" }, { name: "asc" }, { section: "asc" }],
    });

    const years = [...new Set(classes.map((c) => c.academicYear))].sort((a, b) => b - a);
    const classesByYear = years.map((year) => ({
      year,
      status: classes.filter((c) => c.academicYear === year).every((c) => c.status === "COMPLETED")
        ? "COMPLETED"
        : "ACTIVE",
      classes: classes.filter((c) => c.academicYear === year),
    }));

    return Response.json({ success: true, data: classesByYear });
  } catch (error) {
    return errorResponse(error, "[academic-year] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const body = await req.json();
    const { action, campusId: rawCampusId } = body;
    const campusId = await resolveCampusId(user, rawCampusId);

    if (action === "close-year") {
      const { academicYear } = body;
      if (!academicYear) throw new ApiError("academicYear is required", 400);

      const classes = await prisma.class.findMany({
        where: { campusId, academicYear, status: "ACTIVE" },
        include: {
          students: {
            select: {
              id: true,
              rollNo: true,
              fullName: true,
              admissionNo: true,
              reportCards: {
                where: { exam: { academicYear } },
                select: { percentage: true, grade: true },
                orderBy: { generatedAt: "desc" },
                take: 1,
              },
            },
          },
        },
      });

      if (classes.length === 0) throw new ApiError("No active classes found for this year", 404);

      await prisma.$transaction(async (tx) => {
        for (const cls of classes) {
          for (const student of cls.students) {
            const latestReport = student.reportCards[0];
            await tx.studentClassHistory.upsert({
              where: {
                studentId_classId_academicYear: {
                  studentId: student.id,
                  classId: cls.id,
                  academicYear,
                },
              },
              create: {
                studentId: student.id,
                classId: cls.id,
                campusId,
                rollNo: student.rollNo,
                academicYear,
                status: "ACTIVE",
                finalGrade: latestReport?.grade || null,
                finalPercentage: latestReport?.percentage || null,
              },
              update: {
                finalGrade: latestReport?.grade || null,
                finalPercentage: latestReport?.percentage || null,
              },
            });

            if (!student.admissionNo) {
              const count = await tx.student.count({ where: { campusId, admissionNo: { not: null } } });
              await tx.student.update({
                where: { id: student.id },
                data: { admissionNo: `ADM-${academicYear}-${String(count + 1).padStart(4, "0")}` },
              });
            }
          }

          await tx.class.update({
            where: { id: cls.id },
            data: { status: "COMPLETED" },
          });
        }
      });

      return Response.json({
        success: true,
        message: `Closed ${classes.length} classes for academic year ${academicYear}`,
        closedClasses: classes.length,
        totalStudents: classes.reduce((sum, c) => sum + c.students.length, 0),
      });
    }

    if (action === "promote") {
      const { promotions } = body;
      if (!Array.isArray(promotions) || promotions.length === 0) {
        throw new ApiError("promotions array is required", 400);
      }

      let promoted = 0;
      await prisma.$transaction(async (tx) => {
        for (const promo of promotions) {
          const { studentId, targetClassId, newRollNo } = promo;
          if (!studentId || !targetClassId) continue;

          const student = await tx.student.findUnique({
            where: { id: studentId },
            select: { id: true, classId: true, rollNo: true, campusId: true, class: { select: { academicYear: true } } },
          });
          if (!student) continue;

          const targetClass = await tx.class.findUnique({
            where: { id: targetClassId },
            select: { id: true, academicYear: true, name: true, section: true, campusId: true },
          });
          if (!targetClass) continue;

          await tx.studentClassHistory.upsert({
            where: {
              studentId_classId_academicYear: {
                studentId: student.id,
                classId: student.classId,
                academicYear: student.class.academicYear,
              },
            },
            create: {
              studentId: student.id,
              classId: student.classId,
              campusId: student.campusId,
              rollNo: student.rollNo,
              academicYear: student.class.academicYear,
              status: "PROMOTED",
              promotedToClassId: targetClassId,
            },
            update: {
              status: "PROMOTED",
              promotedToClassId: targetClassId,
            },
          });

          const rollNo = newRollNo || await generateRollNo(tx, targetClass);
          await tx.student.update({
            where: { id: studentId },
            data: { classId: targetClassId, rollNo },
          });

          promoted++;
        }
      });

      return Response.json({ success: true, promoted, message: `Promoted ${promoted} students` });
    }

    if (action === "bulk-promote") {
      const { fromClassId, toClassId } = body;
      if (!fromClassId || !toClassId) throw new ApiError("fromClassId and toClassId required", 400);

      const fromClass = await prisma.class.findUnique({
        where: { id: fromClassId },
        select: { id: true, academicYear: true, campusId: true },
      });
      const toClass = await prisma.class.findUnique({
        where: { id: toClassId },
        select: { id: true, academicYear: true, name: true, section: true, campusId: true },
      });
      if (!fromClass || !toClass) throw new ApiError("Class not found", 404);

      const students = await prisma.student.findMany({
        where: { classId: fromClassId },
        select: { id: true, rollNo: true, campusId: true },
        orderBy: { rollNo: "asc" },
      });

      if (students.length === 0) throw new ApiError("No students in source class", 400);

      let promoted = 0;
      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < students.length; i++) {
          const student = students[i];

          await tx.studentClassHistory.upsert({
            where: {
              studentId_classId_academicYear: {
                studentId: student.id,
                classId: fromClassId,
                academicYear: fromClass.academicYear,
              },
            },
            create: {
              studentId: student.id,
              classId: fromClassId,
              campusId: student.campusId,
              rollNo: student.rollNo,
              academicYear: fromClass.academicYear,
              status: "PROMOTED",
              promotedToClassId: toClassId,
            },
            update: {
              status: "PROMOTED",
              promotedToClassId: toClassId,
            },
          });

          const rollNo = await generateRollNo(tx, toClass, i);
          await tx.student.update({
            where: { id: student.id },
            data: { classId: toClassId, rollNo },
          });

          promoted++;
        }
      });

      return Response.json({ success: true, promoted, message: `Promoted ${promoted} students from ${fromClassId} to ${toClassId}` });
    }

    throw new ApiError("Unknown action. Use: close-year, promote, bulk-promote", 400);
  } catch (error) {
    return errorResponse(error, "[academic-year] POST failed");
  }
}

async function generateRollNo(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  targetClass: { name: string; section: string | null; campusId: string; id: string },
  offset = 0
): Promise<string> {
  const abbrev = targetClass.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  const secChar = (targetClass.section || "A").charAt(0).toUpperCase();
  const prefix = `${abbrev}-${secChar}-`;

  const existingRolls = await tx.student.findMany({
    where: { classId: targetClass.id, rollNo: { startsWith: prefix } },
    select: { rollNo: true },
  });
  let maxNum = 0;
  for (const s of existingRolls) {
    const num = parseInt(s.rollNo.slice(prefix.length), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  const seqNum = maxNum + 1 + offset;
  return `${prefix}${String(seqNum).padStart(3, "0")}`;
}
