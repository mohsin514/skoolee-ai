import { assertSameOrigin } from "@/lib/auth/same-origin";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { prepareQuestionReuse } from "@/lib/school-ai/question-bank-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { assertSameOrigin(request); return Response.json(await prepareQuestionReuse(await requireSchoolAiUser("add"), await readBoundedJson(request, 512 * 1024)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
