import { z } from "zod";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { getExamResults, reviseExamResult, appealExamResult, resolveExamAppeal, previewExamKeyCorrection } from "@/lib/school-ai/exam-results";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request, context: Context) {
 try { const attemptId = new URL(request.url).searchParams.get("attemptId") ?? undefined; if (attemptId && attemptId.length > 120) throw new Error("INVALID_ATTEMPT"); return Response.json(await getExamResults(await requireAuthUser(), (await context.params).id, attemptId), { headers }); } catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: Context) {
 try { assertSameOrigin(request); const input = z.object({ action: z.enum(["revise", "appeal", "resolve", "preview-key"]), data: z.unknown() }).strict().parse(await readBoundedJson(request)); const user = await requireAuthUser(), id = (await context.params).id; const result = input.action === "preview-key" ? await previewExamKeyCorrection(user, id, input.data) : input.action === "revise" ? await reviseExamResult(user, id, input.data) : input.action === "appeal" ? await appealExamResult(user, id, input.data) : await resolveExamAppeal(user, id, input.data); return Response.json({ result }, { headers }); } catch (error) { return schoolAiError(error); }
}
