import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { listSchoolAiAttempts, reviewSchoolAiAttempt } from "@/lib/school-ai/exam-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { z } from "zod";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { return Response.json(await listSchoolAiAttempts(await requireAuthUser(), (await context.params).id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const input = z.object({ attemptId: z.string().min(1).max(120), review: z.unknown() }).strict().parse(await readBoundedJson(request));
    return Response.json({ result: await reviewSchoolAiAttempt(await requireAuthUser(), (await context.params).id, input.attemptId, input.review) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
