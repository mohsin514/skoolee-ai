import { z } from "zod";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { acceptCorrection, acceptInvite, adoptQuestion, authorizeShare, createNetwork, inviteSchool, networkOverview, proposeCorrection, publishQuestion, reportUse, reviewQuestion, shareableQuestions, submitQuestion, withdrawQuestion } from "@/lib/question-network/service";

// SKO-454: the teacher question review network. Teaching staff only; answer keys never reach learners.
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const user = await requireAuthUser();
    const [overview, shareable] = await Promise.all([networkOverview(user), shareableQuestions(user)]);
    return Response.json({ success: true, data: { ...overview, shareable } }, { headers });
  } catch (error) { return errorResponse(error, "[question-network] GET failed"); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const body = z.object({ action: z.enum(["network", "invite", "accept-invite", "submit", "authorize", "review", "publish", "correct", "withdraw", "adopt", "accept-correction", "report"]), id: z.string().min(1).max(120).optional(), data: z.unknown().optional() }).strict().parse(await request.json().catch(() => ({})));
    const id = body.id ?? "";
    const run = (): Promise<unknown> => {
      switch (body.action) {
        case "network": return createNetwork(user, body.data);
        case "invite": return inviteSchool(user, id, body.data);
        case "accept-invite": return acceptInvite(user, id);
        case "submit": return submitQuestion(user, body.data);
        case "authorize": return authorizeShare(user, id);
        case "review": return reviewQuestion(user, id, body.data);
        case "publish": return publishQuestion(user, id, body.data);
        case "correct": return proposeCorrection(user, id, body.data);
        case "withdraw": return withdrawQuestion(user, id, body.data);
        case "adopt": return adoptQuestion(user, id);
        case "accept-correction": return acceptCorrection(user, id);
        default: return reportUse(user, id, body.data);
      }
    };
    return Response.json({ success: true, data: await run() }, { headers });
  } catch (error) { return errorResponse(error, "[question-network] POST failed"); }
}
