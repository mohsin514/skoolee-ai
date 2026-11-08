import { z } from "zod";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { copyLessonPlanToClass, publishLessonActivity, recordLessonDelivery, setLessonGroups, viewLessonPlan } from "@/lib/school-ai/lesson-plan-service";

// SKO-414: lesson-plan working state — checks, private groups, delivery, publishing activities as
// assignment drafts and copying content to another class.
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input = z.object({ curriculumId: z.string().min(1).max(120), planId: z.string().min(1).max(120) }).parse({ curriculumId: params.get("curriculumId"), planId: params.get("planId") });
    return Response.json({ result: await viewLessonPlan(await requireAuthUser(), input.curriculumId, input.planId) }, { headers });
  } catch (error) { return schoolAiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const input = z.object({ action: z.enum(["groups", "delivery", "publish", "copy"]), data: z.unknown() }).strict().parse(await readBoundedJson(request));
    const result = input.action === "groups" ? await setLessonGroups(user, input.data)
      : input.action === "delivery" ? await recordLessonDelivery(user, input.data)
      : input.action === "publish" ? await publishLessonActivity(user, input.data)
      : await copyLessonPlanToClass(user, input.data);
    return Response.json({ result }, { headers, status: input.action === "publish" || input.action === "copy" ? 201 : 200 });
  } catch (error) {
    const issues = (error as { issues?: unknown }).issues;
    if (Array.isArray(issues) && typeof issues[0] === "string") return Response.json({ error: (error as Error).message, issues }, { status: 409, headers });
    return schoolAiError(error);
  }
}
