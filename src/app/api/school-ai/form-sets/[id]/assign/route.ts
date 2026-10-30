import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { assignFormSet } from "@/lib/school-ai/form-set-service";

export const dynamic = "force-dynamic";
// SKO-408 R10.4, R10.8: the whole set is assigned or refused; each candidate gets exactly one form.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ assigned: await assignFormSet(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 40000)) }, { status: 201, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
