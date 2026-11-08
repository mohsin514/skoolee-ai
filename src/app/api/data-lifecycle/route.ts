import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser, readJsonObject } from "@/lib/api/scope";
import { lifecycleOverview, placeLegalHold, previewRetention, releaseLegalHold, setRetentionSchedule } from "@/lib/data-lifecycle/service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const category = req.nextUrl.searchParams.get("preview");
    const body = category ? { success: true, preview: await previewRetention(user, category) } : { success: true, ...(await lifecycleOverview(user)) };
    return Response.json(body, { headers: noStore });
  } catch (error) {
    const response = errorResponse(error, "[data-lifecycle] GET failed");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { action, ...input } = await readJsonObject(req);
    if (action === "schedule") return Response.json({ success: true, schedule: await setRetentionSchedule(user, input) }, { headers: noStore });
    if (action === "hold") return Response.json({ success: true, hold: await placeLegalHold(user, input) }, { headers: noStore });
    if (action === "release") return Response.json({ success: true, ...(await releaseLegalHold(user, input)) }, { headers: noStore });
    throw new ApiError("Unknown data lifecycle action.", 400);
  } catch (error) {
    return errorResponse(error, "[data-lifecycle] POST failed");
  }
}
