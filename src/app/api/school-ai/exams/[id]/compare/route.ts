import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { outcomeComparison } from "@/lib/school-ai/practice-service";

export const dynamic = "force-dynamic";
// SKO-408 R18.9-R18.10: earlier and later outcome evidence side by side, with sample sizes, no causal claim.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ comparison: await outcomeComparison(await requireAuthUser(), (await context.params).id, new URL(request.url).searchParams.get("later") ?? "") }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
