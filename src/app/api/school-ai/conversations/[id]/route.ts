import { z } from "zod";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { getPrivateConversation, updatePrivateConversation } from "@/lib/school-ai/conversation-service";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { const user = await requireSchoolAiUser("view"), { id } = await context.params; const before = new URL(request.url).searchParams.get("beforeVersion"); return Response.json(await getPrivateConversation(user, id, before === null ? undefined : z.coerce.number().int().positive().parse(before)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const user = await requireSchoolAiUser("add"), { id } = await context.params; return Response.json({ conversation: await updatePrivateConversation(user, id, await readBoundedJson(request, 4000)) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
