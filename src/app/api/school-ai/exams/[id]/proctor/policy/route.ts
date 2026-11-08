import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { updateExamProctorPolicy } from "@/lib/school-ai/exam-proctor-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); return Response.json(await updateExamProctorPolicy(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 4000)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
