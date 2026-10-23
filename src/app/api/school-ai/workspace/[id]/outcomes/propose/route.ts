import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { proposeOutline } from "@/lib/school-ai/syllabus-outline-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const noStore = { "Cache-Control": "private, no-store" };

// SKO-500: the syllabus outline step (propose). The record id is the uploaded SOURCE.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    return Response.json(await proposeOutline(user, (await context.params).id, await readBoundedJson(request, 1000)), { headers: noStore });
  } catch (error) { return schoolAiError(error); }
}
