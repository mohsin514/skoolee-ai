import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { reopenAttendance } from "@/lib/school-ai/paper-sitting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-503: the office reopens a recorded absence (audited, with a reason).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(req); return Response.json({ success: true, data: await reopenAttendance(await requireAuthUser(), (await ctx.params).id, req.nextUrl.searchParams.get("scheduleId") ?? "", await readBoundedJson(req, 4000)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error, "[paper-slots/:id/attendance/reopen] POST failed"); }
}
