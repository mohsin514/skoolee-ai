import { NextRequest } from "next/server";
import { approveTemplate, decide, deleteTemplate, deliveredPdf, findStudents, isLeader, listIssues, listTemplates, previewIssue, requestIssue, saveTemplate } from "@/lib/certificates/service";
import { renderCertificate } from "@/lib/certificates/pdf";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { idBody, jsonObjectBody } from "@/lib/validators/route-bodies";

// SKO-469 certificates and ID cards.
// GET    ?campusId=                          → templates (draft and approved version)
// GET    ?issues=1&status=&q=                → issued and requested documents
// GET    ?students=<query>                   → pupils in this campus (name, roll, admission no, class)
// GET    ?download=<issueId>                 → the delivered PDF, stored on first download (X-Artifact-Hash, X-Pdf-Sha256)
// POST   {action: "save-template", id?, kind, name, language, pageSize, requiresApproval, title, body}
// POST   {action: "approve-template", id}    → leader snapshots the draft as the next approved version
// POST   {action: "preview", templateId, studentId}
// POST   {action: "issue", templateId, studentId, idempotencyKey, previousId?, reissueReason?}
// PATCH  {id, version, action: approve|reject|revoke, note?}   → leader decisions on a document
// DELETE ?id=<templateId>                    → only a never-approved draft

const STATUSES = ["PENDING_APPROVAL", "ISSUED", "REJECTED", "REVOKED", "SUPERSEDED"];

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "front-desk");
    const params = request.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, params.get("campusId"));
    const download = params.get("download");
    if (download) {
      const { issue, pdf, pdfSha256 } = await deliveredPdf(user, campusId, download, (row, school) => renderCertificate(row, school, request.nextUrl.origin));
      return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${issue.serial}.pdf"`, "X-Artifact-Hash": issue.artifactHash, "X-Pdf-Sha256": pdfSha256, "X-Document-State": issue.status, "Cache-Control": "no-store" } });
    }
    const students = params.get("students");
    if (students !== null) return Response.json({ success: true, data: await findStudents(user, campusId, students) });
    if (params.get("issues")) {
      const status = params.get("status");
      if (status && !STATUSES.includes(status)) throw new ApiError("Unknown status", 400);
      return Response.json({ success: true, data: await listIssues(user, campusId, { status, q: params.get("q") ?? "" }) });
    }
    return Response.json({ success: true, data: await listTemplates(user, campusId), canApprove: isLeader(user) });
  } catch (error) {
    return errorResponse(error, "[front-desk] certificates GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "front-desk");
    await assertPermission(user, "front-desk", "add");
    const body = await parseBody(request, jsonObjectBody);
    const campusId = await resolveCampusId(user, body.campusId);
    switch (body.action) {
      case "save-template": return Response.json({ success: true, data: await saveTemplate(user, campusId, body) });
      case "approve-template": return Response.json({ success: true, data: await approveTemplate(user, campusId, String(body.id ?? "")) });
      case "preview": return Response.json({ success: true, data: await previewIssue(user, campusId, body) });
      case "issue": {
        const issue = await requestIssue(user, campusId, body);
        const { requestHash: _hash, idempotencyKey: _key, pdf: _pdf, ...data } = issue;
        return Response.json({ success: true, data }, { status: 201 });
      }
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) {
    return errorResponse(error, "[front-desk] certificates POST failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "front-desk");
    await assertPermission(user, "front-desk", "edit");
    const body = await parseBody(request, idBody);
    const campusId = await resolveCampusId(user, body.campusId);
    const { requestHash: _hash, idempotencyKey: _key, pdf: _pdf, ...data } = await decide(user, campusId, body);
    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] certificates PATCH failed");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "front-desk");
    await assertPermission(user, "front-desk", "delete");
    const id = request.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));
    await deleteTemplate(user, campusId, id);
    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[front-desk] certificates DELETE failed");
  }
}
