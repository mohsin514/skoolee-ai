import { z } from "zod";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { gradebookConversionSchema } from "@/lib/school-ai/exam-gradebook";
import { getExamGradebookOptions, previewExamGradebook, publishExamGradebook } from "@/lib/school-ai/exam-gradebook-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireAuthUser(), id = (await context.params).id, query = new URL(request.url).searchParams;
    if (query.has("examId")) {
      const examId = z.string().min(1).max(128).parse(query.get("examId"));
      const conversion = gradebookConversionSchema.parse(query.get("conversion"));
      return Response.json({ preview: await previewExamGradebook(user, id, examId, conversion) }, { headers });
    }
    return Response.json({ options: await getExamGradebookOptions(user, id) }, { headers });
  } catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(), input = await readBoundedJson(request, 12000);
    return Response.json({ publication: await publishExamGradebook(user, (await context.params).id, input) }, { headers });
  } catch (error) { return schoolAiError(error); }
}
