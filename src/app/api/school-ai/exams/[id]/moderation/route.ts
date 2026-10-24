import { z } from "zod";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { createModerationSample, decideResultCorrection, moderationOverview, proposeResultCorrection, resolveSampleItem, submitSecondMark } from "@/lib/school-ai/exam-moderation-service";

// SKO-424: moderation samples, second marking and independently approved corrections.
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: Context) {
  try { return Response.json({ result: await moderationOverview(await requireAuthUser(), (await context.params).id) }, { headers }); }
  catch (error) { return schoolAiError(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const input = z.object({ action: z.enum(["propose", "decide", "sample", "second-mark", "resolve"]), sampleId: z.string().min(1).max(120).optional(), data: z.unknown() }).strict().parse(await readBoundedJson(request));
    const user = await requireAuthUser(), id = (await context.params).id;
    const sampleId = input.sampleId ?? "";
    const result = input.action === "propose" ? await proposeResultCorrection(user, id, input.data)
      : input.action === "decide" ? await decideResultCorrection(user, id, input.data)
      : input.action === "sample" ? await createModerationSample(user, id, input.data)
      : input.action === "second-mark" ? await submitSecondMark(user, sampleId, input.data)
      : await resolveSampleItem(user, sampleId, input.data);
    return Response.json({ result }, { headers, status: input.action === "propose" || input.action === "sample" ? 201 : 200 });
  } catch (error) { return schoolAiError(error); }
}
