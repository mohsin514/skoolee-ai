import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { recordCorrigendum } from "@/lib/school-ai/moderation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-501: a correction to a sealed paper (never a reprint), also pushed to linked online sittings in progress.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(req); return Response.json({ success: true, data: await recordCorrigendum(await requireAuthUser(), (await ctx.params).id, await readBoundedJson(req, 4000)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error, "[paper-slots/:id/corrigendum] POST failed"); }
}
