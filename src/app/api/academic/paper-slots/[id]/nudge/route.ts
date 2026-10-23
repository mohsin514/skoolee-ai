import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { nudgeSlot } from "@/lib/school-ai/paper-slot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-500: remind the author (in-app), at most once every 12 hours.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(req); return Response.json({ success: true, data: await nudgeSlot(await requireAuthUser(), (await ctx.params).id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error, "[paper-slots/:id/nudge] POST failed"); }
}
