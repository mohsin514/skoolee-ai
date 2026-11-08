import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { recordRehearsal, releaseReadiness } from "@/lib/school-ai/exam-release-service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ readiness: await releaseReadiness(await requireAuthUser(), (await context.params).id) }, { headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ rehearsal: await recordRehearsal(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 32000)) }, { status: 201, headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
