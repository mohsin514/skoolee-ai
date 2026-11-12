import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { ApiError, assertPermission, assertStaffRole, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { campusScope } from "@/lib/auth/policy";

// Sibling lookup.
// GET /api/students/siblings?studentId= — returns every student sharing the
//   same siblingGroupId (itself first), or an empty list when ungrouped.
// GET /api/students/siblings?search=    — search students whose siblingGroupId
//   is non-null (for the "pick an existing sibling" picker in admission). At
//   least two characters; a shorter or missing search returns an empty list.

const SIBLING_SEARCH_MIN = 2;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // School-wide sibling groups — staff only.
    assertStaffRole(user);
    // SKAI-1757: this is a roster-like read (pupil identities + guardian
    // contacts), so it needs Students > View, campus scope, and — for teachers —
    // the classes they teach or lead, exactly like /api/students.
    await assertPermission(user, "students", "view");
    const isTeacher = user.role === "TEACHER";
    const scope: Prisma.StudentWhereInput = {
      ...campusScope(user),
      ...(isTeacher ? { class: { is: { OR: [
        { classTeacherId: user.userId },
        { subjects: { some: { teacherId: user.userId } } },
      ] } } } : {}),
    };
    const studentId = req.nextUrl.searchParams.get("studentId");
    const search = req.nextUrl.searchParams.get("search")?.trim();

    if (studentId) {
      const student = await prisma.student.findFirst({
        where: { id: studentId, ...scope },
        select: { id: true, siblingGroupId: true },
      });
      if (!student) throw new ApiError("Student not found", 404);

      if (!student.siblingGroupId) {
        return Response.json({ success: true, data: [] });
      }

      const siblings = await prisma.student.findMany({
        where: {
          siblingGroupId: student.siblingGroupId,
          consolidatedIntoId: null,
          ...scope,
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

    // SKAI-1875: the admission picker searches as the registrar types. The old no-search branch preloaded
    // the first 200 grouped pupils with guardian contacts and silently dropped everyone past them.
    if (!search || search.length < SIBLING_SEARCH_MIN) return Response.json({ success: true, data: [] });
    const where: Prisma.StudentWhereInput = {
      ...scope,
      consolidatedIntoId: null,
      siblingGroupId: { not: null },
      OR: [
        { fullName: { contains: search, mode: "insensitive" as const } },
        { rollNo: { contains: search, mode: "insensitive" as const } },
        { admissionNo: { contains: search, mode: "insensitive" as const } },
      ],
    };

    const students = await prisma.student.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        rollNo: true,
        admissionNo: true,
        siblingGroupId: true,
        parentUserId: true,
        // Guardian contact details stay with registrars; teachers get the name only.
        parent: { select: { id: true, fullName: true, ...(isTeacher ? {} : { phone: true, email: true }) } },
        class: { select: { name: true, section: true } },
      },
      orderBy: [{ fullName: "asc" }],
      take: 10,
    });
    return Response.json({ success: true, data: students });
  } catch (error) {
    return errorResponse(error, "[students/siblings] GET failed");
  }
}