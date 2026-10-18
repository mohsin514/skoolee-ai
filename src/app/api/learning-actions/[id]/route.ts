import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { activateLearningAction, getLearningAction, handOffLearningAction, recordCheckIn, rescheduleCheckIn, reviewLearningAction, shareLearningAction } from "@/lib/learning/actions";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: Context) {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await getLearningAction(user, (await context.params).id) });
  } catch (error) { return errorResponse(error, "[learning-actions/:id] GET failed"); }
}

const Body = z.object({ action: z.enum(["activate", "share", "check-in", "reschedule", "handoff", "review"]), data: z.record(z.string(), z.unknown()) }).strict();
export async function POST(req: NextRequest, context: Context) {
  try {
    const user = await requireAuthUser();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("Invalid learning action request", 400);
    const { id } = await context.params, { action, data } = parsed.data;
    const version = typeof data.version === "number" ? data.version : -1;
    const result = action === "activate" ? await activateLearningAction(user, id, version)
      : action === "share" ? await shareLearningAction(user, id, version)
      : action === "check-in" ? await recordCheckIn(user, id, data)
      : action === "reschedule" ? await rescheduleCheckIn(user, id, data)
      : action === "handoff" ? await handOffLearningAction(user, id, data)
      : await reviewLearningAction(user, id, data);
    return Response.json({ success: true, data: result });
  } catch (error) { return errorResponse(error, "[learning-actions/:id] POST failed"); }
}
