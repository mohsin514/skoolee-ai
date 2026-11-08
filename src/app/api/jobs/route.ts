import { requireAuthUser, errorResponse } from "@/lib/api/scope";
import { listJobsPage } from "@/lib/jobs/service";
export async function GET(request: Request) {
  try {
    return Response.json(await listJobsPage(await requireAuthUser(), new URL(request.url).searchParams.get("cursor")), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const response = errorResponse(e, "Jobs unavailable");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
