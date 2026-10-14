import { requireAuthUser, errorResponse, ApiError } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readJob, operateJob } from "@/lib/jobs/service";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      await readJob(await requireAuthUser(), (await params).id),
    );
  } catch (e) {
    return errorResponse(e, "Job unavailable");
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(req);
    const user = await requireAuthUser();
    const body = await req.json().catch(() => null);
    if (
      !body ||
      !["retry", "cancel"].includes(body.action) ||
      !Array.isArray(body.items) ||
      body.items.some((x: unknown) => typeof x !== "string")
    )
      throw new ApiError("Invalid action", 400);
    return Response.json(
      await operateJob(user, (await params).id, body.action, body.items),
    );
  } catch (e) {
    return errorResponse(e, "Job action unavailable");
  }
}
