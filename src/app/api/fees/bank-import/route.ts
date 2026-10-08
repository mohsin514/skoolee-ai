import {
  requireAuthUser,
  resolveCampusId,
  errorResponse,
  ApiError,
} from "@/lib/api/scope";
import { assertPermission } from "@/lib/permissions";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { startImportJob } from "@/lib/jobs/processing";
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireAuthUser();
    await assertPermission(user, "fees", "add");
    await assertPermission(user, "fees", "edit");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 2_000_000)
      throw new ApiError("CSV file is required, up to 2 MB", 400);
    const campusId = await resolveCampusId(
      user,
      String(form.get("campusId") || ""),
    );
    const payload: Record<string, string> = {
      csv: await file.text(),
      fileName: file.name,
      campusId,
    };
    for (const key of [
      "currency",
      "accountName",
      "statementFrom",
      "statementTo",
    ])
      payload[key] = String(form.get(key) || "");
    const jobId = await startImportJob(user, campusId, payload);
    return Response.json(
      { success: true, jobId, data: { jobId, status: "queued" } },
      { status: 202 },
    );
  } catch (e) {
    return errorResponse(e, "Bank import unavailable");
  }
}
