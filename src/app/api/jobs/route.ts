import { requireAuthUser, errorResponse } from "@/lib/api/scope";
import { listJobs } from "@/lib/jobs/service";
export async function GET() {
  try {
    return Response.json({ jobs: await listJobs(await requireAuthUser()) });
  } catch (e) {
    return errorResponse(e, "Jobs unavailable");
  }
}
