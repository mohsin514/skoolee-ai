import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { resolveException } from "@/lib/academic/exam-office-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-506: resolve one exception with a recorded decision.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; exceptionId: string }> }) {
  try { assertSameOrigin(req); const { id, exceptionId } = await ctx.params; return Response.json({ success: true, data: await resolveException(await requireAuthUser(), id, exceptionId, await readBoundedJson(req, 8000)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error, "[exam-sessions/:id/exceptions/:exceptionId] PATCH failed"); }
}
