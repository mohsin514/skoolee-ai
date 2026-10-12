import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolveCampusId } from "@/lib/api/scope";
import { assertApprovalRole, assertWorkspacePermission, requireSchoolAiUser } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSchoolAiUser("add");
    assertApprovalRole(user);
    await assertWorkspacePermission(user, "students", "view");
    await assertWorkspacePermission(user, "students", "add");
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));
    const classes = await prisma.class.findMany({ where: { schoolId: user.schoolId, campusId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true, academicYear: true }, orderBy: [{ academicYear: "desc" }, { name: "asc" }, { section: "asc" }], take: 1000 });
    return Response.json({ campusId, classes }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
