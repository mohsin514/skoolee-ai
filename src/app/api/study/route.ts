import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { ask, flagTurn, myTurns, studyCollection } from "@/lib/study/assistant";
import { deliverNotification } from "@/lib/notifications/in-app";

export const runtime = "nodejs";

// SKO-428: the learner's study assistant. GET → approved collection (or the active-exam block) and recent
// questions. POST {action: ask | report | help | delete}.
export async function GET() {
  try {
    const user = await requireAuthUser();
    const [collection, turns] = await Promise.all([studyCollection(user), myTurns(user)]);
    return Response.json({ success: true, data: { ...collection, turns } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[study] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "ask") {
      const result = await ask(user, body);
      return Response.json({ success: true, data: { id: result.turn.id, outcome: result.turn.outcome, answer: result.turn.answer, sources: result.sources } });
    }
    if (!["report", "help", "delete"].includes(String(body.action))) throw new ApiError("Unknown action", 400);
    const result = await flagTurn(user, body);
    // The teacher hears that help was asked for; the question itself stays on the study desk.
    if (result.notify) await deliverNotification("STUDY_HELP_REQUESTED", { schoolId: user.schoolId, campusId: result.notify.campusId, actorId: user.userId, recipientIds: [result.notify.recipientId] }).catch(error => console.error("[study] notice failed", error));
    return Response.json({ success: true, data: { id: result.turn.id } });
  } catch (error) { return errorResponse(error, "[study] POST failed"); }
}
