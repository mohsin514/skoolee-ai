import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { extendAttempts } from "@/lib/school-ai/control-room-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-502: Bounded, idempotent extension with a per-attempt outcome.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json(await extendAttempts(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 40000)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
