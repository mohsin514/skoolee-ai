import { NextRequest } from "next/server";
import {
  ApiError,
  assertSharedModuleRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { getSessionSummary } from "@/lib/academic/exam-sessions";

// GET /api/academic/exam-sessions/[id]?campusId= — one session, fully counted.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    await assertSharedModuleRead(user, "exams");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));
    const { id } = await ctx.params;

    const summary = await getSessionSummary(campusId, id);
    if (!summary) throw new ApiError("Exam session not found", 404);

    return Response.json({ success: true, data: summary });
  } catch (error) {
    return errorResponse(error, "[exam-sessions/:id] GET failed");
  }
}
