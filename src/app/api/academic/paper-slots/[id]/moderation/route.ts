import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { decideModeration, getModeration } from "@/lib/school-ai/moderation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

// SKO-501: the moderator's view (paper, conformance report, history) and decision (SIGNED or RETURNED).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { return Response.json({ success: true, data: await getModeration(await requireAuthUser(), (await ctx.params).id) }, { headers: noStore }); }
  catch (error) { return errorResponse(error, "[paper-slots/:id/moderation] GET failed"); }
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(req); return Response.json({ success: true, data: await decideModeration(await requireAuthUser(), (await ctx.params).id, await readBoundedJson(req, 200000)) }, { headers: noStore }); }
  catch (error) { return errorResponse(error, "[paper-slots/:id/moderation] POST failed"); }
}
