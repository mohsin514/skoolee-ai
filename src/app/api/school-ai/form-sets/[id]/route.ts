import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { schoolAiError } from "@/lib/school-ai/http";
import { addForm, formSetReport } from "@/lib/school-ai/form-set-service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
// SKO-408 R10.3-R10.6: structural parity, shared and differing items and prior exposure; never a difficulty claim.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ report: await formSetReport(await requireAuthUser(), (await context.params).id) }, { headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json({ form: await addForm(await requireAuthUser(), (await context.params).id) }, { status: 201, headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
