import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { formativeComparison } from "@/lib/school-ai/practice-service";

export const dynamic = "force-dynamic";
// SKO-408 R18.8-R18.10: a released formative check beside the exam it followed up, with sample sizes.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ comparison: await formativeComparison(await requireAuthUser(), (await context.params).id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
