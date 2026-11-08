import { z } from "zod";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { createSetupTask, listSetupTasks } from "@/lib/school-ai/setup-task-service";
export const runtime = "nodejs";
const query = z.strictObject({ campusId: z.string().min(1).max(128).optional(), recordId: z.string().min(1).max(128).optional(), before: z.string().min(1).max(128).optional() });
export async function GET(request: Request) { try { const user = await requireSchoolAiUser("view"); return Response.json(await listSetupTasks(user, query.parse(Object.fromEntries(new URL(request.url).searchParams))), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const user = await requireSchoolAiUser("view"); return Response.json({ task: await createSetupTask(user, await readBoundedJson(request, 14000)) }, { status: 201, headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
