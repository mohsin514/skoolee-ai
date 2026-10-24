import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { schoolAiError } from "@/lib/school-ai/http";
import { releaseResults } from "@/lib/school-ai/exam-release-service";

export const dynamic = "force-dynamic";
// SKO-408: moderated results reach learners only through this explicit release.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ release: await releaseResults(await requireAuthUser(), (await context.params).id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
