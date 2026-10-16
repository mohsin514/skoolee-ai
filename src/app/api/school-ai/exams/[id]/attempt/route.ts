import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { getSchoolAiAttempt, getSchoolAiExam, saveSchoolAiAttempt, startSchoolAiExam } from "@/lib/school-ai/exam-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";

import { startExamSchema } from "@/lib/school-ai/exam";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { return Response.json({ attempt: await getSchoolAiAttempt(await requireAuthUser(), (await context.params).id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(), id = (await context.params).id;
    await getSchoolAiExam(user, id);
    const { version, cameraReady, consentVersion } = startExamSchema.parse(await readBoundedJson(request, 1000));
    return Response.json({ attempt: await startSchoolAiExam(user, id, undefined, version, { cameraReady, consentVersion }) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  catch (error) { return schoolAiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    return Response.json({ attempt: await saveSchoolAiAttempt(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 2200000)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
