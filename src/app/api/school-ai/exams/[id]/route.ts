import { requireAuthUser } from "@/lib/api/scope";
import { getSchoolAiExam } from "@/lib/school-ai/exam-service";
import { schoolAiError } from "@/lib/school-ai/http";
import { withSebEvidence } from "@/lib/school-ai/secure-browser";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser(), id = (await context.params).id;
    return Response.json({ exam: await withSebEvidence(request, () => getSchoolAiExam(user, id)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
