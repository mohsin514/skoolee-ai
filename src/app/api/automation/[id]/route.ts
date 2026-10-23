import { requireAutomaticUser as requireAuthUser } from "@/lib/automation/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { advanceAutomaticJob } from "@/lib/automation/service";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const user = await requireAuthUser(); const { id } = await context.params; return Response.json({ job: await advanceAutomaticJob(user, id, await readBoundedJson(request, 12000)) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
