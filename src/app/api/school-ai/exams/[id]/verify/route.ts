import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { verifySitting } from "@/lib/school-ai/exam-print-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-501: recompute the sealed paper's hash and compare it with the sitting's seal.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await verifySitting(await requireAuthUser(), (await context.params).id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
