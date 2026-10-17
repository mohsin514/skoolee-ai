import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { schoolAiError } from "@/lib/school-ai/http";
import { createFormSet } from "@/lib/school-ai/form-set-service";

export const dynamic = "force-dynamic";
// SKO-408 R10.1: this draft paper becomes form A of a new set, with form B beside it.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ formSet: await createFormSet(await requireAuthUser(), (await context.params).id) }, { status: 201, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
