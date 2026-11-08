import { ApiError } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { assertWorkspaceDomainPermission, assertWorkspaceSubject, requireSchoolAiUser, resolveWorkspaceCampus } from "@/lib/school-ai/access";
import { readBoundedForm, schoolAiError } from "@/lib/school-ai/http";
import { documentKindSchema, validateDocument } from "@/lib/school-ai/intake";
import { MAX_SCAN_BYTES, MAX_SCAN_PAGES } from "@/lib/school-ai/scan";
import { assembleScanPdf } from "@/lib/school-ai/scan-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("add");
    if (!(await authRateLimit(`school-ai:scan:${user.schoolId}:${user.userId}`, { limit: 10, windowMs: 300000 })).ok) throw new ApiError("Please wait before preparing another scan.", 429);
    const form = await readBoundedForm(request, MAX_SCAN_BYTES + 100000);
    const campusId = await resolveWorkspaceCampus(user, form.get("campusId") ? String(form.get("campusId")) : undefined);
    const scope = { documentKind: documentKindSchema.parse(form.get("documentKind")), ...(form.get("subjectId") ? { subjectId: String(form.get("subjectId")), classId: String(form.get("classId") ?? "") } : {}) };
    await assertWorkspaceSubject(user, campusId, scope);
    await assertWorkspaceDomainPermission(user, "SOURCE", scope, "add");
    const files = form.getAll("pages");
    if (!files.length || files.length > MAX_SCAN_PAGES || files.some(file => !(file instanceof File))) throw new ApiError("Choose between one and ten scan pages.", 400);
    const images = [];
    for (const file of files as File[]) {
      const bytes = Buffer.from(await file.arrayBuffer());
      let mimeType;
      try { mimeType = validateDocument(file.name, file.type, bytes); }
      catch { throw new ApiError("Choose valid JPEG or PNG scan pages.", 400); }
      if (!["image/jpeg", "image/png"].includes(mimeType)) throw new ApiError("Choose valid JPEG or PNG scan pages.", 400);
      images.push({ bytes, mimeType });
    }
    let result: Buffer;
    try { result = await assembleScanPdf(images); }
    catch { throw new ApiError("The scan could not be prepared. Use up to ten clear JPEG or PNG pages within 8 MB and 12 megapixels per page.", 400); }
    return new Response(new Uint8Array(result), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": 'attachment; filename="prepared-scan.pdf"' } });
  } catch (error) { return schoolAiError(error); }
}
