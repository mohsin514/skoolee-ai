import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";

// Sibling lookup.
// GET /api/students/siblings?studentId= — returns every student sharing the
//   same siblingGroupId (itself first), or an empty list when ungrouped.
// GET /api/students/siblings?search=    — search students whose siblingGroupId
//   is non-null (for the "pick an existing sibling" picker in admission).

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const studentId = req.nextUrl.searchParams.get("studentId");
    const search = req.nextUrl.searchParams.get("search")?.trim();

    if (studentId) {
      const student = await prisma.student.findFirst({
        where: { id: studentId, campus: { schoolId: user.schoolId } },
        select: { id: true, siblingGroupId: true },
      });
      if (!student) throw new ApiError("Student not found", 404);

      if (!student.siblingGroupId) {
        return Response.json({ success: true, data: [] });
      }

      const siblings = await prisma.student.findMany({
        where: {
          siblingGroupId: student.siblingGroupId,
          campus: { schoolId: user.schoolId },
        },
        select: {
          id: true,
          fullName: true,
          rollNo: true,
          admissionNo: true,
          class: { select: { name: true, section: true } },
          siblingGroupId: true,
        },
        orderBy: [{ rollNo: "asc" }],
      });

      return Response.json({ success: true, data: siblings });
    }

    const where = search
      ? {
          siblingGroupId: { not: null },
          campus: { schoolId: user.schoolId },
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { rollNo: { contains: search, mode: "insensitive" as const } },
            { admissionNo: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : { siblingGroupId: { not: null }, campus: { schoolId: user.schoolId } };

    const students = await prisma.student.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        rollNo: true,
        admissionNo: true,
        siblingGroupId: true,
        parentUserId: true,
        parent: { select: { id: true, fullName: true, phone: true, email: true } },
        class: { select: { name: true, section: true } },
      },
      orderBy: [{ fullName: "asc" }],
      take: search ? 10 : 200,
    });
    return Response.json({ success: true, data: students });
  } catch (error) {
    return errorResponse(error, "[students/siblings] GET failed");
  }
}