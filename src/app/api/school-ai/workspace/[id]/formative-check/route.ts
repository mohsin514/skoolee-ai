import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { scheduleFormativeCheck } from "@/lib/school-ai/practice-service";

export const dynamic = "force-dynamic";
// SKO-408 R18.8: schedule a formative check from approved practice; it starts as a draft paper on the ordinary release path.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ record: await scheduleFormativeCheck(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 1000)) }, { status: 201, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
