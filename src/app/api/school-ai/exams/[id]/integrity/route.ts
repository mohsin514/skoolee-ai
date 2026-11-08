import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { getExamIntegrity, recordExamIntegrityEvent, reviewExamIntegrity, updateExamIntegrityPolicy } from "@/lib/school-ai/exam-integrity-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
function errorResponse(error: unknown) {
  const response = schoolAiError(error);
  response.headers.set("Cache-Control", headers["Cache-Control"]);
  return response;
}
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const query = new URL(request.url).searchParams;
    return Response.json(await getExamIntegrity(await requireAuthUser(), (await context.params).id, query.get("cursor") ?? undefined, query.get("eventId") ?? undefined), { headers });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(), id = (await context.params).id;
    if (!(await authRateLimit(`exam-integrity:${user.schoolId}:${user.userId}:${id}`, { limit: 90, windowMs: 60000 })).ok) return Response.json({ error: "Observation reporting is busy. Your exam answers are unaffected." }, { status: 429, headers });
    return Response.json(await recordExamIntegrityEvent(user, id, await readBoundedJson(request, 2500)), { headers });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { assertSameOrigin(request); return Response.json(await reviewExamIntegrity(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 5000)), { headers }); } catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request, context: Context) {
  try { assertSameOrigin(request); return Response.json(await updateExamIntegrityPolicy(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 2500)), { headers }); } catch (error) { return errorResponse(error); }
}
