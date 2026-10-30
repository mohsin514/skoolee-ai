import { ApiError } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { preflightPaperGeneration } from "@/lib/school-ai/paper-generation-service";
import { assertSchoolAiTextProvider } from "@/lib/school-ai/providers";
import { GENERATION_STREAM_HEADERS, encodeFrames } from "@/lib/school-ai/generation-stream";
import { paperGenerationFrames } from "@/lib/school-ai/paper-generation-stream-service";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * SKO-408 R5.1, R5.2, R5.12: paper generation as NDJSON frames. Authorization, the rate limit and
 * the provider check run before the first byte, where a 4xx/503 is still possible; after that every
 * outcome is a terminal frame. The request's own abort signal cancels the provider call.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("add");
    if (!(await authRateLimit(`school-ai:paper:${user.schoolId}:${user.userId}`, { limit: 8, windowMs: 300000 })).ok) throw new ApiError("Please wait before generating another paper.", 429);
    assertSchoolAiTextProvider();
    const body = await readBoundedJson(request);
    await preflightPaperGeneration(user, body); // SKAI-1008: an inactive curriculum pack is refused before the first byte.
    const controller = new AbortController();
    request.signal.addEventListener("abort", () => controller.abort(), { once: true });
    const frames = (async function* () {
      try { yield* paperGenerationFrames(user, body, { signal: controller.signal }); }
      finally { controller.abort(); } // the reader went away: stop the provider request (R5.12)
    })();
    return new Response(encodeFrames(frames), { headers: GENERATION_STREAM_HEADERS });
  } catch (error) {
    const response = schoolAiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
