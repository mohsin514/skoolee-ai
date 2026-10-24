import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { regenerateItem } from "@/lib/school-ai/item-regeneration-service";

export const dynamic = "force-dynamic";
// SKO-408 R5.3/R5.5: a candidate for one item beside the original; nothing is written to the paper.
export async function POST(request: Request, context: { params: Promise<{ id: string; questionId: string }> }) {
  try {
    assertSameOrigin(request);
    const { id, questionId } = await context.params;
    const result = await regenerateItem(await requireAuthUser(), id, questionId, await readBoundedJson(request, 1000));
    return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
