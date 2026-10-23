import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { requireSchoolAiUser, SchoolAiError } from "@/lib/school-ai/access";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { analyzeSetupAnswers } from "@/lib/school-ai/setup-analysis-service";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("add");
    if (!(await authRateLimit(`setup-analysis:${user.schoolId}:${user.userId}`, { limit: 12, windowMs: 300000 })).ok) throw new SchoolAiError("Please wait before analyzing more answers.", 429);
    return Response.json(await analyzeSetupAnswers(user, await readBoundedJson(request, 40000)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
