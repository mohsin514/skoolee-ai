import { z } from "zod";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { confirmNextLesson, proposeNextLesson } from "@/lib/school-ai/next-lesson-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
// SKO-504 Next Ten Minutes: propose a remediation for one outcome, then confirm it as practice.
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const input = z.strictObject({ action: z.enum(["propose", "confirm"]), data: z.unknown() }).parse(await readBoundedJson(request));
    const user = await requireAuthUser(), id = (await context.params).id;
    const result = input.action === "propose" ? await proposeNextLesson(user, id, input.data) : await confirmNextLesson(user, id, input.data);
    return Response.json({ result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
