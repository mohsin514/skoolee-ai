import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertModuleRead, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { assertAcademicModelDraftAccess, createAcademicModelDraft } from "@/lib/academic/model-draft-command";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "exams");
    const params = request.nextUrl.searchParams;
    const sharedTemplatesOnly = params.get("templates") === "1";
    if (sharedTemplatesOnly && user.role !== "SUPER_ADMIN") throw new ApiError("Only a school-group administrator can manage shared templates", 403);

    if (sharedTemplatesOnly) {
      const templates = await prisma.academicModelVersion.findMany({
        where: { schoolId: user.schoolId, campusId: null, isSharedTemplate: true },
        orderBy: [{ cohortKey: "asc" }, { version: "desc" }],
      });
      return Response.json({ success: true, templates, canShareTemplates: true });
    }

    const campusId = await resolveCampusId(user, params.get("campusId"));
    const academicYear = Number(params.get("academicYear")) || new Date().getFullYear();
    const [classes, versions, templates] = await Promise.all([
      prisma.class.findMany({
        where: { campusId, academicYear, status: "ACTIVE" },
        orderBy: [{ name: "asc" }, { section: "asc" }],
        select: { id: true, name: true, section: true, academicYear: true, subjects: { orderBy: { name: "asc" }, select: { id: true, name: true, totalMarks: true } } },
      }),
      prisma.academicModelVersion.findMany({
        where: { schoolId: user.schoolId, academicYear, OR: [{ campusId }, { campusId: null, isSharedTemplate: true, templateApprovedAt: { not: null } }] },
        orderBy: [{ cohortLabel: "asc" }, { version: "desc" }],
      }),
      prisma.academicModelVersion.findMany({
        where: { schoolId: user.schoolId, campusId: null, isSharedTemplate: true, templateApprovedAt: { not: null } },
        orderBy: [{ title: "asc" }, { version: "desc" }],
      }),
    ]);
    return Response.json({ success: true, campusId, academicYear, classes, versions, templates, canShareTemplates: user.role === "SUPER_ADMIN" });
  } catch (error) {
    return errorResponse(error, "[academic-models] GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertAcademicModelDraftAccess(user);
    const body = await parseBody(request, jsonObjectBody);
    const result = await createAcademicModelDraft(user, body);
    if (!result.ok) return Response.json({ error: result.fieldErrors, message: "Review the configuration fields" }, { status: 400 });
    return Response.json({ success: true, model: result.model }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[academic-models] POST failed");
  }
}
