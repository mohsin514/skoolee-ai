import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  assertModuleRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "students");
    const campusId = await resolveCampusId(user);
    const classId = req.nextUrl.searchParams.get("classId");

    if (!classId) {
      return Response.json({ error: "classId is required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, campusId },
      select: { name: true, section: true },
    });

    if (!cls) {
      return Response.json({ error: "Class not found" }, { status: 404 });
    }

    const abbrev = cls.name
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase();
    const secChar = (cls.section || "A").charAt(0).toUpperCase();
    const prefix = `${abbrev}-${secChar}-`;

    // One query on the (campus_id, roll_no) index instead of first listing every
    // class the campus has ever had. The class join keeps the same rows: pupils
    // placed in a class on this campus. No `take` with a lexical sort: suffixes
    // pass 999, so the max stays numeric below.
    const existing = await prisma.student.findMany({
      where: {
        schoolId: user.schoolId,
        campusId,
        class: { campusId },
        rollNo: { startsWith: prefix },
      },
      select: { rollNo: true },
    });

    let maxNum = 0;
    for (const s of existing) {
      const suffix = s.rollNo.slice(prefix.length);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }

    const nextNum = String(maxNum + 1).padStart(3, "0");
    const rollNo = `${prefix}${nextNum}`;

    return Response.json({ rollNo, prefix });
  } catch (err) {
    return errorResponse(err);
  }
}
