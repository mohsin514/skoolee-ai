import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { addResourceVersion, changeAudience, confirmResourceUpload, linkResourceObjectives, publishResource, retireResource } from "@/lib/resources/service";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const { op, ...input } = await parseBody(req, jsonObjectBody);
    const result = op === "version" ? await addResourceVersion(user, id, input)
      : op === "confirm" ? await confirmResourceUpload(user, id, Number(input.version))
      : op === "publish" ? await publishResource(user, id, input)
      : op === "audience" ? await changeAudience(user, id, input)
      : op === "retire" ? await retireResource(user, id)
      : op === "objectives" ? await linkResourceObjectives(user, id, input)
      : (() => { throw new ApiError("Unknown resource action.", 400); })();
    return Response.json({ success: true, result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return (error instanceof ZodError ? Response.json({ error: "Please check the highlighted information.", details: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 }) : errorResponse(error, "[resources] action failed"));
  }
}
