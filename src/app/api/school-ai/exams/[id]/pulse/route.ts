import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { getExamPulse } from "@/lib/school-ai/exam-pulse-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-500: Live Pulse — how far a live sitting has got, per question, without any answer text.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await getExamPulse(await requireAuthUser(), (await context.params).id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
