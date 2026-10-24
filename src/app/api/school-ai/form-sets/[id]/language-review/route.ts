import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { proposeLanguageComparison } from "@/lib/school-ai/form-set-service";

export const dynamic = "force-dynamic";
// SKO-408 R9.6: a model comparison of one language version; findings are proposals awaiting a decision.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ proposals: await proposeLanguageComparison(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 1000)) }, { status: 201, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
