import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { addPassage, removePassage, reviewFlag, teacherStudyDesk } from "@/lib/study/assistant";

export const runtime = "nodejs";

// SKO-428: the teacher's study desk — approved study text per published resource, and learner reports or
// help requests. POST {action: passage | remove | reviewed}.
export async function GET() {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await teacherStudyDesk(user) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[study/teacher] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role === "STUDENT" || user.role === "PARENT") throw new ApiError("Not found", 404);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "passage") return Response.json({ success: true, data: { id: (await addPassage(user, body)).id } }, { status: 201 });
    if (body.action === "remove") return Response.json({ success: true, data: { id: (await removePassage(user, String(body.passageId ?? ""))).id } });
    if (body.action === "reviewed") return Response.json({ success: true, data: { id: (await reviewFlag(user, String(body.turnId ?? ""))).id } });
    throw new ApiError("Unknown action", 400);
  } catch (error) { return errorResponse(error, "[study/teacher] POST failed"); }
}
