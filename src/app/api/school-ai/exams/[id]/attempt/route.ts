import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { getSchoolAiAttempt, getSchoolAiExam, saveSchoolAiAttempt, startSchoolAiExam } from "@/lib/school-ai/exam-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { withSebEvidence } from "@/lib/school-ai/secure-browser";

import { startExamSchema } from "@/lib/school-ai/exam";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { return Response.json({ attempt: await withSebEvidence(request, async () => getSchoolAiAttempt(await requireAuthUser(), (await context.params).id)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(), id = (await context.params).id;
    const { version, cameraReady, consentVersion } = startExamSchema.parse(await readBoundedJson(request, 1000));
    // SKO-449: the request's Safe Exam Browser evidence travels with the start and save calls.
    const attempt = await withSebEvidence(request, async () => { await getSchoolAiExam(user, id); return startSchoolAiExam(user, id, undefined, version, { cameraReady, consentVersion }); });
    return Response.json({ attempt }, { headers: { "Cache-Control": "private, no-store" } });
  }
  catch (error) { return schoolAiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(), id = (await context.params).id, body = await readBoundedJson(request, 2200000);
    return Response.json({ attempt: await withSebEvidence(request, () => saveSchoolAiAttempt(user, id, body)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
