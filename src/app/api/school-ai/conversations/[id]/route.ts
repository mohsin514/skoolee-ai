import { z } from "zod";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { deletePrivateConversation, exportPrivateConversation, getPrivateConversation, updatePrivateConversation } from "@/lib/school-ai/conversation-service";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { const user = await requireSchoolAiUser("view"), { id } = await context.params;
  // SKO-460: the owner's export of what they can currently read, as a downloaded JSON file.
  if (new URL(request.url).searchParams.get("export") === "1") return new Response(JSON.stringify(await exportPrivateConversation(user, id), null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="conversation-${id}.json"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  const before = new URL(request.url).searchParams.get("beforeVersion"); return Response.json(await getPrivateConversation(user, id, before === null ? undefined : z.coerce.number().int().positive().parse(before)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const user = await requireSchoolAiUser("add"), { id } = await context.params; return Response.json({ conversation: await updatePrivateConversation(user, id, await readBoundedJson(request, 4000)) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }

// SKO-460: the owner deletes the conversation and its messages; reviewed records it helped create stay.
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const user = await requireSchoolAiUser("add"), { id } = await context.params; return Response.json(await deletePrivateConversation(user, id, await readBoundedJson(request, 1000)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
