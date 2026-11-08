import { NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { previewPaperGradebook, sendPaperGradebook } from "@/lib/school-ai/paper-gradebook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await requireAuthUser();
    const data = await previewPaperGradebook(user, (await context.params).id, request.nextUrl.searchParams.get("scheduleId") ?? "", request.nextUrl.searchParams.get("conversion") ?? "EXACT");
    return Response.json({ data }, { headers });
  } catch (error) { return schoolAiError(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const data = await sendPaperGradebook(user, (await context.params).id, request.nextUrl.searchParams.get("scheduleId") ?? "", await readBoundedJson(request, 4000));
    return Response.json({ data }, { headers });
  } catch (error) { return schoolAiError(error); }
}
