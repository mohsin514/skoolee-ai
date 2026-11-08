import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { sealSlot } from "@/lib/school-ai/moderation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-501: the Seal (after a signature on the current content and a clean rehearsal).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(req); return Response.json({ success: true, data: await sealSlot(await requireAuthUser(), (await ctx.params).id, await readBoundedJson(req, 4000)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error, "[paper-slots/:id/seal] POST failed"); }
}
