import { z } from "zod";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { decideAssessmentRepair, listAssessmentRepairs, previewAssessmentRepair, proposeAssessmentRepair, resumeAssessmentRepair } from "@/lib/school-ai/assessment-repair";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
// SKO-472: the assessment repair map for one released exam.
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(_request: Request, context: Context) {
 try { return Response.json(await listAssessmentRepairs(await requireAuthUser(), (await context.params).id), { headers }); } catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: Context) {
 try {
  assertSameOrigin(request);
  const input = z.object({ action: z.enum(["preview", "propose", "decide", "resume"]), data: z.unknown() }).strict().parse(await readBoundedJson(request));
  const user = await requireAuthUser(), id = (await context.params).id;
  const result = input.action === "preview" ? await previewAssessmentRepair(user, id, input.data)
   : input.action === "propose" ? await proposeAssessmentRepair(user, id, input.data)
   : input.action === "decide" ? await decideAssessmentRepair(user, id, input.data)
   : await resumeAssessmentRepair(user, id, input.data);
  return Response.json({ result }, { headers });
 } catch (error) { return schoolAiError(error); }
}
