import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { addResourceVersion, changeAudience, confirmResourceUpload, publishResource, retireResource } from "@/lib/resources/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const { op, ...input } = await req.json();
    const result = op === "version" ? await addResourceVersion(user, id, input)
      : op === "confirm" ? await confirmResourceUpload(user, id, Number(input.version))
      : op === "publish" ? await publishResource(user, id, input)
      : op === "audience" ? await changeAudience(user, id, input)
      : op === "retire" ? await retireResource(user, id)
      : (() => { throw new ApiError("Unknown resource action.", 400); })();
    return Response.json({ success: true, result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "[resources] action failed");
  }
}
