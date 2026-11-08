import { z } from "zod";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { answerPractice, finishPractice, myPractice, pausePractice, practiceProgress, practiceSession, rescheduleRevisit, startPractice, takeHint, teacherRevisit } from "@/lib/school-ai/practice-session-service";

// SKO-426: learner practice sessions with hints and spaced revisits; teacher progress and revisit control.
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input = z.object({ sessionId: z.string().min(1).max(120).nullable(), practiceRecordId: z.string().min(1).max(120).nullable() }).parse({ sessionId: params.get("sessionId"), practiceRecordId: params.get("practiceRecordId") });
    const user = await requireAuthUser();
    const result = input.sessionId ? await practiceSession(user, input.sessionId) : input.practiceRecordId ? await practiceProgress(user, input.practiceRecordId) : await myPractice(user);
    return Response.json({ result }, { headers });
  } catch (error) { return schoolAiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const input = z.object({ action: z.enum(["start", "hint", "answer", "pause", "finish", "reschedule", "teacher-revisit"]), sessionId: z.string().min(1).max(120).optional(), data: z.unknown() }).strict().parse(await readBoundedJson(request));
    const sessionId = input.sessionId ?? "";
    const result = input.action === "start" ? await startPractice(user, input.data)
      : input.action === "hint" ? await takeHint(user, sessionId, input.data)
      : input.action === "answer" ? await answerPractice(user, sessionId, input.data)
      : input.action === "pause" ? await pausePractice(user, sessionId)
      : input.action === "finish" ? await finishPractice(user, sessionId)
      : input.action === "reschedule" ? await rescheduleRevisit(user, input.data)
      : await teacherRevisit(user, input.data);
    return Response.json({ result }, { headers });
  } catch (error) { return schoolAiError(error); }
}
