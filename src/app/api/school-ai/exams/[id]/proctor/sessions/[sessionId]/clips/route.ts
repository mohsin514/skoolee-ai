import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { uploadExamProctorClip } from "@/lib/school-ai/exam-proctor-service";
import { PROCTOR_CLIP_BYTES } from "@/lib/school-ai/exam-proctor";
import { readBoundedBytes, schoolAiError } from "@/lib/school-ai/http";
export async function POST(request: Request, context: { params: Promise<{ id: string; sessionId: string }> }) {
  try { assertSameOrigin(request); const user = await requireAuthUser(), { id, sessionId } = await context.params, value = new URL(request.url).searchParams.get("sequence"); return Response.json(await uploadExamProctorClip(user, id, sessionId, value !== null && /^\d+$/.test(value) ? Number(value) : NaN, await readBoundedBytes(request, PROCTOR_CLIP_BYTES), request.headers.get("content-type") ?? ""), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
