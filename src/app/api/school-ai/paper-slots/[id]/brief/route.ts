import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { schoolAiError } from "@/lib/school-ai/http";
import { slotBrief } from "@/lib/school-ai/paper-slot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-500: create (once) or return the brief for a requested paper, with the office's facts confirmed.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json(await slotBrief(await requireAuthUser(), (await context.params).id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
