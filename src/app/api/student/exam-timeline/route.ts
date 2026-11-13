import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { myExamTimeline } from "@/lib/school-ai/exam-timeline-service";

export const dynamic = "force-dynamic";
// SKO-505 My Next Paper: the learner's published papers and online sittings as one timeline.
export async function GET() {
  try {
    const timeline = await myExamTimeline(await requireAuthUser());
    // SKAI-1936: an unlinked learner gets an empty, not-linked answer (200), like /api/timetable/class.
    return Response.json(timeline ? { timeline } : { timeline: null, linked: false }, { headers: { "Cache-Control": "private, no-store" } });
  }
  catch (error) { return errorResponse(error, "[student/exam-timeline] GET failed"); }
}
