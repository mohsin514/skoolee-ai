import { requireAuthUser } from "@/lib/api/scope";
import { readExamProctorClip } from "@/lib/school-ai/exam-proctor-service";
import { schoolAiError } from "@/lib/school-ai/http";
export async function GET(_request: Request, context: { params: Promise<{ id: string; clipId: string }> }) {
  try { const { id, clipId } = await context.params, clip = await readExamProctorClip(await requireAuthUser(), id, clipId); return new Response(new Uint8Array(clip.bytes), { headers: { "Content-Type": clip.mimeType, "Content-Length": String(clip.bytes.length), "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer" } }); }
  catch (error) { return schoolAiError(error); }
}
