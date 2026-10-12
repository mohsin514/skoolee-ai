import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { listQuestionBank } from "@/lib/school-ai/question-bank-service";
import { schoolAiError } from "@/lib/school-ai/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return Response.json(await listQuestionBank(await requireSchoolAiUser(), Object.fromEntries(new URL(request.url).searchParams)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
