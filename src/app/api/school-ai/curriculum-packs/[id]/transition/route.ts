import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { transitionCurriculumPack } from "@/lib/school-ai/curriculum-pack-service";
import { packError, packHeaders } from "@/lib/school-ai/curriculum-pack-http";

export const dynamic = "force-dynamic";

// Approve (educator approver, with dates), activate (after every check passes) or revoke (terminal, with reason).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    return Response.json(await transitionCurriculumPack(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 2000)), { headers: packHeaders });
  } catch (error) { return packError(error); }
}
