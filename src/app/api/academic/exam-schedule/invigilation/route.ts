import { assertSameOrigin } from "@/lib/auth/same-origin";
import { SchoolAiError } from "@/lib/school-ai/access";
import { NextRequest } from "next/server";
import { requireAuthUser, ApiError } from "@/lib/api/scope";
import { invigilationUpdateSchema, listExamInvigilation, updateExamInvigilation } from "@/lib/academic/exam-invigilation";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser(), sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId || sessionId.length > 128) throw new ApiError("sessionId is required", 400);
    return Response.json(await listExamInvigilation(user, sessionId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return error instanceof SchoolAiError ? Response.json({ error: error.message, code: error.code }, { status: error.status }) : schoolAiError(error); }
}
export async function PATCH(request: NextRequest) {
  try { assertSameOrigin(request); return Response.json(await updateExamInvigilation(await requireAuthUser(), invigilationUpdateSchema.parse(await readBoundedJson(request, 2000))), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return error instanceof SchoolAiError ? Response.json({ error: error.message, code: error.code }, { status: error.status }) : schoolAiError(error); }
}
