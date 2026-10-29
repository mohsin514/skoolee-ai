import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { ACTIVE_CAMPUS_COOKIE, activeCampusCookieAttributes, encodeActiveCampus } from "@/lib/auth/active-campus";
import { lookupSchoolCampus } from "@/lib/auth/active-campus-server";

export const dynamic = "force-dynamic";

/** SKAI-1113: the SUPER_ADMIN campus switcher. Only a live campus of the caller's own school can be chosen. */
async function requireSuperAdmin() {
  const user = await requireAuthUser();
  if (user.role !== "SUPER_ADMIN") throw new ApiError("Only the group administrator can switch campuses.", 403);
  return user;
}

export async function GET() {
  try {
    const user = await requireSuperAdmin();
    const campuses = await prisma.campus.findMany({ where: { schoolId: user.schoolId, archivedAt: null }, select: { id: true, name: true, city: true }, orderBy: { name: "asc" } });
    return NextResponse.json({ success: true, data: { activeCampusId: user.activeCampusId ?? null, campuses } });
  } catch (error) { return errorResponse(error, "[super/active-campus] GET failed"); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSuperAdmin();
    const body = await request.json().catch(() => null) as { campusId?: unknown } | null;
    const campusId = body?.campusId ?? null;
    if (campusId !== null && typeof campusId !== "string") throw new ApiError("Choose a campus or All campuses.", 400);
    const response = NextResponse.json({ success: true, data: { activeCampusId: campusId } });
    if (campusId === null) {
      response.cookies.set(ACTIVE_CAMPUS_COOKIE, "", activeCampusCookieAttributes(0));
      return response;
    }
    // Same 404 for another school's campus and a missing one: never confirm another tenant's IDs.
    if (!(await lookupSchoolCampus(user.schoolId, campusId))) throw new ApiError("Campus not found.", 404);
    response.cookies.set(ACTIVE_CAMPUS_COOKIE, encodeActiveCampus(user.userId, campusId), activeCampusCookieAttributes());
    return response;
  } catch (error) { return errorResponse(error, "[super/active-campus] POST failed"); }
}
