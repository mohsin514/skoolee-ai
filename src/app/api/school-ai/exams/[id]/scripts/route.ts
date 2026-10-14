import { z } from "zod";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { issueExamScript, verifyExamScript, importExamScript } from "@/lib/school-ai/exam-script-service";
import { proposeScriptResponses } from "@/lib/school-ai/script-response-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 try { assertSameOrigin(request); const input = z.object({ action: z.enum(["issue", "verify", "import", "suggest"]), data: z.unknown() }).strict().parse(await readBoundedJson(request)); const user = await requireAuthUser(), id = (await context.params).id; const result = input.action === "issue" ? await issueExamScript(user, id, input.data) : input.action === "verify" ? await verifyExamScript(user, id, input.data) : input.action === "suggest" ? await proposeScriptResponses(user, id, input.data) : await importExamScript(user, id, input.data); return Response.json({ result }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); }
}
