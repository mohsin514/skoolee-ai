import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedForm, readBoundedJson } from "@/lib/school-ai/http";
import { recordPackEvidence } from "@/lib/school-ai/curriculum-pack-service";
import { packError, packHeaders } from "@/lib/school-ai/curriculum-pack-http";

export const dynamic = "force-dynamic";
const MAX_DOCUMENT = 8 * 1024 * 1024;

// Records a source's rights scope and permission evidence; multipart requests may attach the permission document.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const { id } = await context.params;
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data;")) {
      const form = await readBoundedForm(request, MAX_DOCUMENT + 16000);
      const file = form.get("file");
      const fields = { sourceId: String(form.get("sourceId") ?? ""), rightsScope: String(form.get("rightsScope") ?? ""), permissionEvidence: String(form.get("permissionEvidence") ?? "") };
      if (file !== null && !(file instanceof File)) throw new ApiError("The evidence document could not be read.", 400);
      const document = file && file.size ? { bytes: Buffer.from(await file.arrayBuffer()), type: file.type, name: file.name } : undefined;
      return Response.json(await recordPackEvidence(user, id, fields, document), { headers: packHeaders });
    }
    return Response.json(await recordPackEvidence(user, id, await readBoundedJson(request, 4000)), { headers: packHeaders });
  } catch (error) { return packError(error); }
}
