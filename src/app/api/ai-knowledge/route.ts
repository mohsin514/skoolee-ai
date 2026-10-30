import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { SchoolAiError } from "@/lib/school-ai/access";
import { listKnowledge, saveKnowledge } from "@/lib/rag/service";
import { workflowJson } from "@/lib/ai-workflows/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return workflowJson(await listKnowledge(await requireAutomaticUser())); } catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser();
    if (!(await authRateLimit(`rag-write:${user.userId}`, { limit: 30, windowMs: 300000 })).ok) throw new SchoolAiError("Too many document changes. Try again shortly.", 429);
    return workflowJson({ document: await saveKnowledge(user, await readBoundedJson(request, 360000)) }, { status: 201 });
  } catch (error) { return schoolAiError(error); }
}
