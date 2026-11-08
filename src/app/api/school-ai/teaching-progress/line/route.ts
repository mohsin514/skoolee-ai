import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { moveTeachingLine } from "@/lib/school-ai/teaching-progress-service";
import { SchoolAiError } from "@/lib/school-ai/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

// SKO-500: move the Teaching Line forward (record taught outcomes) or back (un-teach), audited.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    // The latest calendar date anywhere right now (UTC+14), so a school ahead of UTC is never refused its own today.
    const today = new Date(Date.now() + 14 * 3_600_000).toISOString().slice(0, 10);
    return Response.json({ line: await moveTeachingLine(user, await readBoundedJson(request, 4000), today) }, { headers: noStore });
  } catch (error) {
    // The map reacts to TEACHING_LINE_STALE (reload) and shows the others; keep the code in the body.
    if (error instanceof SchoolAiError && error.code) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    return schoolAiError(error);
  }
}
