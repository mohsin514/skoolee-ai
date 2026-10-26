import { z } from "zod";
import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { SchoolAiError } from "@/lib/school-ai/access";
import { answerKnowledge } from "@/lib/rag/answer";
import { querySchema } from "@/lib/rag/core";
import { workflowJson } from "@/lib/ai-workflows/http";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser();
    if (!(await authRateLimit(`rag-query:${user.userId}`, { limit: 20, windowMs: 300000 })).ok) throw new SchoolAiError("Too many questions. Try again shortly.", 429);
    const input = z.strictObject({ query: querySchema, language: z.enum(["en", "ur", "ar"]).default("en") }).parse(await readBoundedJson(request, 6000));
    return workflowJson(await answerKnowledge(user, input.query, input.language));
  } catch (error) { return schoolAiError(error); }
}
