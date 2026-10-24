import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { acknowledgeClarification, issueClarification, listClarifications } from "@/lib/school-ai/exam-incident-service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
// SKO-408 R17: staff issue versioned notices; a candidate reads and acknowledges only their own.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await listClarifications(await requireAuthUser(), (await context.params).id), { headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const [user, { id }, body] = await Promise.all([requireAuthUser(), context.params, readBoundedJson(request, 8000)]);
    if (body && typeof body === "object" && "acknowledge" in body) return Response.json(await acknowledgeClarification(user, id, body), { headers: noStore });
    return Response.json({ notice: await issueClarification(user, id, body) }, { status: 201, headers: noStore });
  } catch (error) { return schoolAiError(error); }
}
