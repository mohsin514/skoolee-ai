import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { scanScript } from "@/lib/school-ai/paper-sitting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-503: match a script cover's QR to its candidate; once only.
export async function POST(req: NextRequest) {
  try { assertSameOrigin(req); return Response.json({ success: true, data: await scanScript(await requireAuthUser(), await readBoundedJson(req, 5000)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error, "[paper-scripts/scan] POST failed"); }
}
