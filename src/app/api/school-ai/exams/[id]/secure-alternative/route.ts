import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { grantSupervisedAlternative } from "@/lib/school-ai/secure-browser-service";

export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ alternative: await grantSupervisedAlternative(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 2000)) }, { status: 201, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
