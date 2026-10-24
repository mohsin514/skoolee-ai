import { z } from "zod";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { getSetupTask, updateSetupTask } from "@/lib/school-ai/setup-task-service";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { const user = await requireSchoolAiUser("view"), { id } = await context.params, before = new URL(request.url).searchParams.get("beforeVersion"); return Response.json(await getSetupTask(user, id, before === null ? undefined : z.coerce.number().int().positive().parse(before)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const user = await requireSchoolAiUser("view"), { id } = await context.params; return Response.json(await updateSetupTask(user, id, await readBoundedJson(request, 26000)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
