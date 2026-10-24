import { requireAuthUser, errorResponse, ApiError } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { jobOperationSchema } from "@/lib/jobs/contract";
import { readJob, operateJob } from "@/lib/jobs/service";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      await readJob(await requireAuthUser(), (await params).id),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    const response = errorResponse(e, "Job unavailable");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(req);
    const user = await requireAuthUser();
    const parsed = jobOperationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("Choose a valid action, selection and reason", 400);
    const body = parsed.data;
    return Response.json(
      await operateJob(user, (await params).id, body.action, body.items, body.reason),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    const response = errorResponse(e, "Job action unavailable");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
