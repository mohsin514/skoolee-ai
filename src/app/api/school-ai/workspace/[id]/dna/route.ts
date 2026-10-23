import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { getPaperDna } from "@/lib/school-ai/paper-dna-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-500: Paper DNA (deterministic; no provider call, no answer keys).
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await getPaperDna(await requireAuthUser(), (await context.params).id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
