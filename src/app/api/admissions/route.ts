import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { actOnApplication, applicationDetail, convertApplication, documentFile, listApplications, listForms, publishForm, saveForm, setFormOpen, staffSaveAnswers, staffStart } from "@/lib/admissions/service";
import { ApiError, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { idBody, jsonObjectBody } from "@/lib/validators/route-bodies";

// SKO-398 admissions (staff).
// GET   ?forms=1                         → forms with draft and published version
// GET   ?id=<applicationId>              → review: answers against their form version, submissions, documents, duplicates, history
// GET   ?document=<documentId>           → one attached file
// GET   ?owners=1 | ?classes=1           → choices for owner and intake class
// GET   ?view=active|mine|unassigned|overdue|all&status=&q=   → pipeline with counts
// POST  {action: save-form|publish-form|open-form|start|save-answers|convert, ...}
// PATCH {id, version, action: assign|note|review|request-info|offer|waitlist|reject|record-acceptance|record-decline|withdraw|staff-submit, ...}

const STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "OFFERED", "WAITLISTED", "ACCEPTED", "DECLINED", "REJECTED", "WITHDRAWN", "ENROLLED"];

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const params = request.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, params.get("campusId"));
    if (params.get("forms")) return Response.json({ success: true, data: await listForms(user, campusId) });
    const id = params.get("id");
    if (id) return Response.json({ success: true, data: await applicationDetail(user, campusId, id) });
    const documentId = params.get("document");
    if (documentId) {
      const document = await documentFile(user, campusId, documentId);
      return new Response(new Uint8Array(document.data), { headers: { "Content-Type": document.contentType, "Content-Disposition": `attachment; filename="${encodeURIComponent(document.fileName)}"`, "X-Content-Sha256": document.sha256, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    if (params.get("owners") || params.get("classes")) {
      await listForms(user, campusId); // same admissions read check
      if (params.get("owners")) return Response.json({ success: true, data: await prisma.user.findMany({ where: { schoolId: user.schoolId, isActive: true, role: { in: ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "RECEPTIONIST"] }, OR: [{ campusId }, { role: "SUPER_ADMIN" }] }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }) });
      return Response.json({ success: true, data: await prisma.class.findMany({ where: { campusId, schoolId: user.schoolId, archivedAt: null }, select: { id: true, name: true, section: true }, orderBy: [{ name: "asc" }, { section: "asc" }] }) });
    }
    const view = params.get("view") ?? "active";
    if (!["active", "mine", "unassigned", "overdue", "all"].includes(view)) throw new ApiError("Unknown view", 400);
    const status = params.get("status");
    if (status && !STATUSES.includes(status)) throw new ApiError("Unknown status", 400);
    return Response.json({ success: true, ...(await listApplications(user, campusId, { view, status, q: params.get("q") ?? "" })) });
  } catch (error) {
    return errorResponse(error, "[admissions] GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await parseBody(request, jsonObjectBody);
    const campusId = await resolveCampusId(user, body.campusId);
    switch (body.action) {
      case "save-form": return Response.json({ success: true, data: await saveForm(user, campusId, body) });
      case "publish-form": return Response.json({ success: true, data: await publishForm(user, campusId, String(body.id ?? "")) });
      case "open-form": return Response.json({ success: true, data: await setFormOpen(user, campusId, String(body.id ?? ""), body.isOpen === true) });
      case "start": return Response.json({ success: true, data: await staffStart(user, campusId, body) }, { status: 201 });
      case "save-answers": return Response.json({ success: true, data: await staffSaveAnswers(user, campusId, body) });
      case "convert": return Response.json({ success: true, data: await convertApplication(user, campusId, body) });
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) {
    return errorResponse(error, "[admissions] POST failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await parseBody(request, idBody);
    const campusId = await resolveCampusId(user, body.campusId);
    return Response.json({ success: true, data: await actOnApplication(user, campusId, body) });
  } catch (error) {
    return errorResponse(error, "[admissions] PATCH failed");
  }
}
