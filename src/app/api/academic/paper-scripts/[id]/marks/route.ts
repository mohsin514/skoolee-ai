import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { markScript } from "@/lib/school-ai/paper-sitting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-503: per-question marks for a hand-marked script.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(req); return Response.json({ success: true, data: await markScript(await requireAuthUser(), (await ctx.params).id, await readBoundedJson(req, 20000)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error, "[paper-scripts/:id/marks] POST failed"); }
}
