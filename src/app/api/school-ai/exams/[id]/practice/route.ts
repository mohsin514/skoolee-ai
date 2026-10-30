import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { draftPractice } from "@/lib/school-ai/practice-service";

export const dynamic = "force-dynamic";
// SKO-408 R18.4: a draft practice set from this released exam; learners see it only after approval.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ record: await draftPractice(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 4000).catch(() => ({}))) }, { status: 201, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
