import { NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { ApiError } from "@/lib/api/scope";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { generateSetupWorkflows, getSetupGenerationState } from "@/lib/school-ai/setup-generation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const user = await requireSchoolAiUser();
    const query = request.nextUrl.searchParams;
    const state = await getSetupGenerationState(user, { recordId: query.get("recordId"), expectedVersion: Number(query.get("expectedVersion")), language: query.get("language") });
    return Response.json(state, { headers });
  } catch (error) { return schoolAiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("add");
    if (!(await authRateLimit(`school-ai:setup:${user.schoolId}:${user.userId}`, { limit: 12, windowMs: 300_000 })).ok) throw new ApiError("Please wait before generating another setup package.", 429);
    return Response.json(await generateSetupWorkflows(user, await readBoundedJson(request, 4096)), { headers });
  } catch (error) { return schoolAiError(error); }
}
