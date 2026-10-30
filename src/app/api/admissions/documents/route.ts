import { NextRequest } from "next/server";
import { staffUpload } from "@/lib/admissions/service";
import { ApiError, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// SKO-398: staff attach a document to an application (multipart: applicationId, key, file).
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("Choose a file to upload.", 400);
    const campusId = await resolveCampusId(user, form.get("campusId") ? String(form.get("campusId")) : null);
    return Response.json({ success: true, data: await staffUpload(user, campusId, String(form.get("applicationId") ?? ""), String(form.get("key") ?? ""), file) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[admissions] document upload failed");
  }
}
