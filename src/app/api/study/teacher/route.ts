import { NextRequest } from "next/server";
import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { created, failFrom, ok } from "@/lib/api/envelope";
import { addPassage, removePassage, reviewFlag, teacherStudyDesk } from "@/lib/study/assistant";

export const runtime = "nodejs";

// SKO-428: the teacher's study desk — approved study text per published resource, and learner reports or
// help requests. POST {action: passage | remove | reviewed}.
export async function GET() {
  try {
    const user = await requireAuthUser();
    return ok(await teacherStudyDesk(user), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failFrom(error, "[study/teacher] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role === "STUDENT" || user.role === "PARENT") throw new ApiError("Not found", 404);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "passage") return created({ id: (await addPassage(user, body)).id });
    if (body.action === "remove") return ok({ id: (await removePassage(user, String(body.passageId ?? ""))).id });
    if (body.action === "reviewed") return ok({ id: (await reviewFlag(user, String(body.turnId ?? ""))).id });
    throw new ApiError("Unknown action", 400);
  } catch (error) { return failFrom(error, "[study/teacher] POST failed"); }
}
