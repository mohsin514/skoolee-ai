import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { listSessionSlots, requestPapers } from "@/lib/school-ai/paper-slot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

// SKO-500: the session's paper requests (one per grade and subject), with their derived status.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { return Response.json({ success: true, data: await listSessionSlots(await requireAuthUser(), (await ctx.params).id) }, { headers: noStore }); }
  catch (error) { return errorResponse(error, "[exam-sessions/:id/paper-slots] GET failed"); }
}
// "Request papers": create the missing slots, link every section's date-sheet row, notify each author.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(req); return Response.json({ success: true, data: await requestPapers(await requireAuthUser(), (await ctx.params).id, await readBoundedJson(req, 40000)) }, { headers: noStore }); }
  catch (error) { return errorResponse(error, "[exam-sessions/:id/paper-slots] POST failed"); }
}
