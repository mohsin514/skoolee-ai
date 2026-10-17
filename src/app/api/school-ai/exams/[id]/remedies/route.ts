import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { listRemedies, proposeRemedy } from "@/lib/school-ai/exam-incident-service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
// SKO-408 R17.7-R17.8: a remedy is first a per-candidate preview; nothing changes until it is authorized.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await listRemedies(await requireAuthUser(), (await context.params).id), { headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ remedy: await proposeRemedy(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 8000)) }, { status: 201, headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
