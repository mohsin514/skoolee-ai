import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { draftFamilyNotes, listFamilyNotes } from "@/lib/school-ai/family-note-service";
import { schoolAiError } from "@/lib/school-ai/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
// SKO-504: the sitting's family notes, and drafting them from released results.
export async function GET(_request: Request, context: Context) {
  try { return Response.json({ notes: await listFamilyNotes(await requireAuthUser(), (await context.params).id) }, { headers }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request, context: Context) {
  try { assertSameOrigin(request); return Response.json({ notes: await draftFamilyNotes(await requireAuthUser(), (await context.params).id) }, { headers }); }
  catch (error) { return schoolAiError(error); }
}
