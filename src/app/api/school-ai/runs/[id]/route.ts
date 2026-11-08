import { assertSameOrigin } from "@/lib/auth/same-origin";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { updateSchoolRun } from "@/lib/school-ai/run-service";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const user = await requireSchoolAiUser("edit"), { id } = await context.params; return Response.json({ run: await updateSchoolRun(user, id, await readBoundedJson(request, 2000)) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
