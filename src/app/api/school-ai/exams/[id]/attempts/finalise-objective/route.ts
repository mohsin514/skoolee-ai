import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { finaliseObjectiveOnlyAttempts } from "@/lib/school-ai/exam-auto-finalise";
import { schoolAiError } from "@/lib/school-ai/http";

type Context = { params: Promise<{ id: string }> };
// SKAI-785: a marker finalises every attempt whose answers are all auto-scored in one action.
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    return Response.json({ result: await finaliseObjectiveOnlyAttempts(await requireAuthUser(), (await context.params).id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
