import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { myExamTimeline } from "@/lib/school-ai/exam-timeline-service";

export const dynamic = "force-dynamic";
// SKO-505 My Next Paper: the learner's published papers and online sittings as one timeline.
export async function GET() {
  try { return Response.json({ timeline: await myExamTimeline(await requireAuthUser()) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error, "[student/exam-timeline] GET failed"); }
}
