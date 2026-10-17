import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { BriefRefusedError, answerBrief, getBrief } from "@/lib/school-ai/brief-service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
// SKO-408: one brief decision per request; every accepted answer is a new immutable record version.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ brief: await getBrief(await requireAuthUser(), (await context.params).id) }, { headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ brief: await answerBrief(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 8000)) }, { headers: noStore }); }
  catch (error) {
    // R3.12: the failed bound and the brief that keeps the entered text, never a bare error.
    if (error instanceof BriefRefusedError) return Response.json({ error: error.message, code: error.code, brief: error.view }, { status: error.status, headers: noStore });
    return schoolAiError(error);
  }
}
