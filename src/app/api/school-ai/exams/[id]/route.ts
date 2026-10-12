import { requireAuthUser } from "@/lib/api/scope";
import { getSchoolAiExam } from "@/lib/school-ai/exam-service";
import { schoolAiError } from "@/lib/school-ai/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return Response.json({ exam: await getSchoolAiExam(await requireAuthUser(), (await context.params).id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
