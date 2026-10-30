import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { schoolAiError } from "@/lib/school-ai/http";
import { addForm, addLanguageVersion, formSetReport } from "@/lib/school-ai/form-set-service";
import { readBoundedJson } from "@/lib/school-ai/http";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
// SKO-408 R10.3-R10.6: structural parity, shared and differing items and prior exposure; never a difficulty claim.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ report: await formSetReport(await requireAuthUser(), (await context.params).id) }, { headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const [user, { id }] = await Promise.all([requireAuthUser(), context.params]);
    const body = request.headers.get("content-length") === "0" ? null : await readBoundedJson(request, 2000).catch(() => null);
    // A body naming a language adds that language version of a form (R9.1); no body adds the next form.
    if (body && typeof body === "object" && "language" in body) return Response.json({ language: await addLanguageVersion(user, id, body) }, { status: 201, headers: noStore });
    return Response.json({ form: await addForm(user, id) }, { status: 201, headers: noStore });
  }
  catch (error) { return schoolAiError(error); }
}
