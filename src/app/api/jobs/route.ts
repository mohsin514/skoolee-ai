import { requireAuthUser, errorResponse } from "@/lib/api/scope";
import { listJobs } from "@/lib/jobs/service";
export async function GET() {
  try {
    return Response.json({ jobs: await listJobs(await requireAuthUser()) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const response = errorResponse(e, "Jobs unavailable");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
