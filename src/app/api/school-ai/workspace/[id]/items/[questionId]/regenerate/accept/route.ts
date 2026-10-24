import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { acceptRegeneratedItem } from "@/lib/school-ai/item-regeneration-service";

export const dynamic = "force-dynamic";
// SKO-408 R5.6: accept the server-recorded candidate; the paper must not have changed since.
export async function POST(request: Request, context: { params: Promise<{ id: string; questionId: string }> }) {
  try {
    assertSameOrigin(request);
    const { id, questionId } = await context.params;
    return Response.json({ record: await acceptRegeneratedItem(await requireAuthUser(), id, questionId, await readBoundedJson(request, 1000)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
