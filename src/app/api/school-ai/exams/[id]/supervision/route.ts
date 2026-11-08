import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { superviseAttempts } from "@/lib/school-ai/exam-incident-service";

export const dynamic = "force-dynamic";
// SKO-408 R15.4: a supervised pause stops the clock; resuming restores exactly the paused time.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json(await superviseAttempts(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 40000)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
