import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { requireSchoolAiUser, SchoolAiError } from "@/lib/school-ai/access";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { prepareSetupActions } from "@/lib/school-ai/setup-actions-service";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
 try {
  assertSameOrigin(request); const user = await requireSchoolAiUser("add");
  if (!(await authRateLimit(`setup-actions:${user.schoolId}:${user.userId}`, { limit: 10, windowMs: 300000 })).ok) throw new SchoolAiError("Please wait before preparing more drafts.", 429);
  return Response.json(await prepareSetupActions(user, await readBoundedJson(request, 4096)), { headers: { "Cache-Control": "private, no-store" } });
 } catch (error) { return schoolAiError(error); }
}
