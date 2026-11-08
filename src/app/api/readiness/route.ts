import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { approveReadiness, readinessView, rehearsalPreview, switchAdoptionMode, updateReadinessTask } from "@/lib/readiness/service";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, ...(await readinessView(user)) }, { headers: noStore });
  } catch (error) {
    const response = errorResponse(error, "[readiness] GET failed");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // `op` routes the request; task updates carry their own `action`.
    const { op, ...input } = await parseBody(req, jsonObjectBody);
    if (op === "approve") return Response.json({ success: true, readiness: await approveReadiness(user, input) }, { headers: noStore });
    if (op === "task") return Response.json({ success: true, task: await updateReadinessTask(user, input) }, { headers: noStore });
    if (op === "rehearse") return Response.json({ success: true, preview: await rehearsalPreview(user, input) }, { headers: noStore });
    if (op === "mode") return Response.json({ success: true, ...(await switchAdoptionMode(user, input)) }, { headers: noStore });
    throw new ApiError("Unknown readiness action.", 400);
  } catch (error) {
    return errorResponse(error, "[readiness] POST failed");
  }
}
