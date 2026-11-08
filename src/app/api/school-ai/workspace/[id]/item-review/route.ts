import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { reviewItem } from "@/lib/school-ai/exam-release-service";

export const dynamic = "force-dynamic";
// SKO-408: the only route that changes an item's review state; ordinary paper saves cannot.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ review: await reviewItem(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 4000)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
