import { z } from "zod";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { createPrivateConversation, listPrivateConversations } from "@/lib/school-ai/conversation-service";
export const runtime = "nodejs";
const query = z.object({ campusId: z.string().min(1).max(128).optional(), subjectId: z.string().min(1).max(128).optional(), classId: z.string().min(1).max(128).optional(), purpose: z.enum(["WORKSPACE", "SETUP"]).optional(), topicKey: z.string().min(1).max(80).optional(), before: z.string().min(1).max(128).optional(), archived: z.enum(["true", "false"]).optional() });
export async function GET(request: Request) { try { const user = await requireSchoolAiUser("view"), input = query.parse(Object.fromEntries(new URL(request.url).searchParams)); return Response.json(await listPrivateConversations(user, { ...input, archived: input.archived === "true" }), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const user = await requireSchoolAiUser("add"); return Response.json({ conversation: await createPrivateConversation(user, await readBoundedJson(request, 10000)) }, { status: 201, headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
