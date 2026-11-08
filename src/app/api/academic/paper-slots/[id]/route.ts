import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { patchSlot } from "@/lib/school-ai/paper-slot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-500: the office edits one paper request (compare-and-set on its version).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(req); return Response.json({ success: true, data: await patchSlot(await requireAuthUser(), (await ctx.params).id, await readBoundedJson(req, 20000)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error, "[paper-slots/:id] PATCH failed"); }
}
