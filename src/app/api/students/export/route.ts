import { NextRequest } from "next/server";
import { csvCell } from "@/lib/csv";
import { prisma } from "@/lib/db/prisma";
import {
  assertPermission,
  assertStaffRole,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";

// GET /api/academic/students/export?classId=&search=&status=
//
// CSV of the roster exactly as the screen filters it (§22 import/export).
// The counterpart of the existing bulk CSV *import*, which could load a roster
// in but gave no way to get one back out.
//
// Staff only, and gated on the same `students.view` permission as the roster —
// an export is the entire roster in one file, including guardian contacts, so
// it must not be an easier door than the list it comes from.


const COLUMNS: { header: string; get: (s: any) => unknown }[] = [
  { header: "Roll No", get: (s) => s.rollNo },
  { header: "Full Name", get: (s) => s.fullName },
  { header: "Class", get: (s) => [s.class?.name, s.class?.section].filter(Boolean).join(" - ") },
  { header: "Academic Year", get: (s) => s.class?.academicYear },
  { header: "Gender", get: (s) => s.gender },
  { header: "Date of Birth", get: (s) => (s.dateOfBirth ? s.dateOfBirth.toISOString().slice(0, 10) : "") },
  { header: "Status", get: (s) => s.status },
  { header: "Student Email", get: (s) => s.studentUser?.email },
  { header: "Phone", get: (s) => s.phone },
  { header: "Guardian Name", get: (s) => s.guardianName },
  { header: "Guardian Phone", get: (s) => s.guardianPhone },
  { header: "Guardian Email", get: (s) => s.guardianEmail },
  { header: "Address", get: (s) => s.address },
  { header: "City", get: (s) => s.city },
];

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    if (!canManageOperations(user)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "students", "view");

    const sp = req.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, sp.get("campusId"));
    const classId = sp.get("classId");
    const search = sp.get("search")?.trim();
    const archivedOnly = sp.get("status") === "archived";

    const students = await prisma.student.findMany({
      where: {
        ...scopedCampusWhere(user, campusId),
        ...(classId ? { classId } : {}),
        ...(archivedOnly
          ? { status: { in: ["inactive", "archived", "transferred", "graduated"] } }
          : { status: { notIn: ["inactive", "archived", "transferred", "graduated"] } }),
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: "insensitive" as const } },
                { rollNo: { contains: search, mode: "insensitive" as const } },
                { guardianName: { contains: search, mode: "insensitive" as const } },
                { guardianPhone: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: {
        class: { select: { name: true, section: true, academicYear: true } },
        studentUser: { select: { email: true } },
      },
      orderBy: [{ class: { name: "asc" } }, { rollNo: "asc" }],
    });

    const rows = [
      COLUMNS.map((c) => csvCell(c.header)).join(","),
      ...students.map((s) => COLUMNS.map((c) => csvCell(c.get(s))).join(",")),
    ];

    // The BOM is what makes Excel read UTF-8 rather than mangling every Urdu
    // name in the file — the roster stores nameUr, so this is not hypothetical.
    const body = `﻿${rows.join("\r\n")}\r\n`;
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="students-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, "[students/export] GET failed");
  }
}
