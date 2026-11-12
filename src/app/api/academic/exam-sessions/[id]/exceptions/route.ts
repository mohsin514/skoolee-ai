import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertPlanFeature } from "@/lib/billing/entitlements";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { createException, listExceptions } from "@/lib/academic/exam-office-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

// SKO-506 exceptions desk: absences by category, unfair means, exemptions and re-sit requests.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { return Response.json({ success: true, data: await listExceptions(await requireAuthUser(), (await ctx.params).id, req.nextUrl.searchParams.get("cursor")?.slice(0, 200)) }, { headers: noStore }); }
  catch (error) { return errorResponse(error, "[exam-sessions/:id/exceptions] GET failed"); }
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(req); const user = await requireAuthUser(); await assertPlanFeature(user, "examPlanningEnabled"); return Response.json({ success: true, data: await createException(user, (await ctx.params).id, await readBoundedJson(req, 8000)) }, { status: 201, headers: noStore }); }
  catch (error) { return errorResponse(error, "[exam-sessions/:id/exceptions] POST failed"); }
}
