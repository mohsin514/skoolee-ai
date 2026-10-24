import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { listEvidencePacks, produceEvidencePack } from "@/lib/school-ai/evidence-pack-service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
// SKO-408 R19: produce an evidence pack for this assessment (or one attempt) and list earlier ones.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ packs: await listEvidencePacks(await requireAuthUser(), (await context.params).id) }, { headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json(await produceEvidencePack(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 4000)), { status: 201, headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
