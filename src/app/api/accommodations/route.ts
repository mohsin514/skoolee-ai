import { NextRequest } from "next/server";
import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { schoolAiError } from "@/lib/school-ai/http";
import { coordinatorView, learnerView, recordRehearsal, revokePlan, savePlan, staffView } from "@/lib/accommodations/service";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const view = req.nextUrl.searchParams.get("view");
    const classId = req.nextUrl.searchParams.get("classId") || undefined;
    const body = view === "coordinator" ? await coordinatorView(user, classId ? { classId } : {})
      : view === "staff" ? { plans: await staffView(user) }
      : view === "learner" ? await learnerView(user)
      : (() => { throw new ApiError("Choose a view.", 400); })();
    return Response.json({ success: true, ...body }, { headers: noStore });
  } catch (error) { return schoolAiError(error); }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await requireAuthUser();
    const { op, planId, ...input } = await parseBody(req, jsonObjectBody);
    const result = op === "plan" ? await savePlan(user, input)
      : op === "revoke" ? await revokePlan(user, String(planId ?? ""), input)
      : op === "rehearse" ? await recordRehearsal(user, { planId, ...input })
      : (() => { throw new ApiError("Unknown access-plan action.", 400); })();
    return Response.json({ success: true, result }, { headers: noStore });
  } catch (error) { return schoolAiError(error); }
}
