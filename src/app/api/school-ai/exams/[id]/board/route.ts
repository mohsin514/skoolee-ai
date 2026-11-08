import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { controlBoard } from "@/lib/school-ai/control-room-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-502: the live roster board (server-time stamped; no answers).
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await controlBoard(await requireAuthUser(), (await context.params).id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
