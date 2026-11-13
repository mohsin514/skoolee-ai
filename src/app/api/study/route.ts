import { NextRequest } from "next/server";
import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { ask, flagTurn, myTurns, studyCollection } from "@/lib/study/assistant";
import { deliverNotification } from "@/lib/notifications/in-app";

export const runtime = "nodejs";

// SKO-428: the learner's study assistant. GET → approved collection (or the active-exam block) and recent
// questions. POST {action: ask | report | help | delete}.
export async function GET() {
  try {
    const user = await requireAuthUser();
    const [collection, turns] = await Promise.all([studyCollection(user), myTurns(user)]);
    return ok({ ...collection, turns }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failFrom(error, "[study] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "ask") {
      const result = await ask(user, body);
      return ok({ id: result.turn.id, outcome: result.turn.outcome, answer: result.turn.answer, sources: result.sources });
    }
    if (!["report", "help", "delete"].includes(String(body.action))) throw new ApiError("Unknown action", 400);
    const result = await flagTurn(user, body);
    // The teacher hears that help was asked for; the question itself stays on the study desk.
    if (result.notify) await deliverNotification("STUDY_HELP_REQUESTED", { schoolId: user.schoolId, campusId: result.notify.campusId, actorId: user.userId, recipientIds: [result.notify.recipientId] }).catch(error => console.error("[study] notice failed", error));
    return ok({ id: result.turn.id });
  } catch (error) { return failFrom(error, "[study] POST failed"); }
}
