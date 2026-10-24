import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { learningActionContext, listLearningActions, saveLearningAction } from "@/lib/learning/actions";

// SKO-425: learning actions (structured InterventionPlan) for staff.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const [actions, context] = await Promise.all([listLearningActions(user, req.nextUrl.searchParams.get("studentId")), learningActionContext(user)]);
    return Response.json({ success: true, data: { actions, ...context } });
  } catch (error) { return errorResponse(error, "[learning-actions] GET failed"); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await saveLearningAction(user, await req.json().catch(() => null)) }, { status: 201 });
  } catch (error) { return errorResponse(error, "[learning-actions] POST failed"); }
}
