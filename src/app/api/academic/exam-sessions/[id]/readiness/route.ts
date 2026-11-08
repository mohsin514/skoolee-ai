import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { sessionReadiness } from "@/lib/academic/exam-office-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-506 Control tower: "are we ready for <day>?" for one session (default: the next day with papers).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { return Response.json({ success: true, data: await sessionReadiness(await requireAuthUser(), (await ctx.params).id, req.nextUrl.searchParams.get("date")) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error, "[exam-sessions/:id/readiness] GET failed"); }
}
