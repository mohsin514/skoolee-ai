import { z } from "zod";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { setupTaskOptions } from "@/lib/school-ai/setup-task-service";
import { SETUP_ANSWER_KEYS } from "@/lib/school-ai/onboarding";
export const runtime = "nodejs";
const query = z.strictObject({ recordId: z.string().min(1).max(128), fieldKey: z.enum(SETUP_ANSWER_KEYS) });
export async function GET(request: Request) { try { const user = await requireSchoolAiUser("view"), input = query.parse(Object.fromEntries(new URL(request.url).searchParams)); return Response.json(await setupTaskOptions(user, input.recordId, input.fieldKey), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
