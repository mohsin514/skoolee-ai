import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parseFilters, searchRecords } from "@/lib/search/service";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";

// SKO-401 record search. GET ?q=&types=student,class,staff,application&campus=&year=&class=&status=active|archived|all&page=
// GET ?options=1 → the campuses, years and classes the reader may filter by.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const params = request.nextUrl.searchParams;
    if (params.get("options")) {
      const result = await searchRecords(user, { q: "", types: ["class"], campusId: null, academicYear: null, classId: null, status: "all", page: 1 }).catch(() => null);
      const campusWhere = user.role === "SUPER_ADMIN" ? { schoolId: user.schoolId } : { id: user.campusId ?? "", schoolId: user.schoolId };
      const [campuses, classes] = await Promise.all([
        prisma.campus.findMany({ where: { ...campusWhere, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        result?.allowedTypes.includes("class") ? prisma.class.findMany({ where: { schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }), ...(user.role === "TEACHER" ? { OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] } : {}) }, select: { id: true, name: true, section: true, academicYear: true }, orderBy: [{ academicYear: "desc" }, { name: "asc" }] }) : [],
      ]);
      return Response.json({ success: true, data: { campuses: user.role === "SUPER_ADMIN" ? campuses : [], classes, years: [...new Set(classes.map(cls => cls.academicYear))].sort((a, b) => b - a), allowedTypes: result?.allowedTypes ?? [] } });
    }
    return Response.json({ success: true, data: await searchRecords(user, parseFilters(params)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "[search] GET failed");
  }
}
