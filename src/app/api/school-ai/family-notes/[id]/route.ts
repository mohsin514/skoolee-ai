import { z } from "zod";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { saveFamilyNote, sendFamilyNote } from "@/lib/school-ai/family-note-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
// SKO-504: edit the sentence of an unsent family note, or send it.
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { action, ...data } = z.object({ action: z.enum(["save", "send"]) }).passthrough().parse(await readBoundedJson(request));
    const user = await requireAuthUser(), id = (await context.params).id;
    return Response.json({ note: action === "save" ? await saveFamilyNote(user, id, data) : await sendFamilyNote(user, id, data) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
