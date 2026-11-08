import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { examTwin } from "@/lib/school-ai/exam-twin-service";

export const dynamic = "force-dynamic";
// SKO-507: Exam Twin estimates (and, after release, "Twin said / class scored" and Item Watch).
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ twin: await examTwin(await requireAuthUser(), (await context.params).id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
