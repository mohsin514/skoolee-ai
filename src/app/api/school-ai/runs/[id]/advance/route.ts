import { z } from "zod";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { requireSchoolAiUser, SchoolAiError } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { processSchoolRun } from "@/lib/school-ai/run-service";
export const runtime = "nodejs";
export const maxDuration = 60;
/** Advances one already-reviewed, actor-owned run. No operation or preview can be supplied here. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("edit");
    const id = z.string().min(1).max(128).parse((await context.params).id);
    if (!(await authRateLimit(`setup-advance:${user.schoolId}:${user.userId}`, { limit: 60, windowMs: 60000 })).ok) throw new SchoolAiError("Please wait before continuing setup.", 429);
    const run = await processSchoolRun(user, id);
    return Response.json({ run }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
