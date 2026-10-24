import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { createSchoolAiExam, examRoster, listSchoolAiExams } from "@/lib/school-ai/exam-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser();
    const paperId = new URL(request.url).searchParams.get("paperId");
    return Response.json(paperId ? { students: await examRoster(user, paperId) } : { exams: await listSchoolAiExams(user) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    return Response.json({ exam: await createSchoolAiExam(user, await readBoundedJson(request, 100000)) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
