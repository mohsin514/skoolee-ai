import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { createUploadedPaper } from "@/lib/school-ai/paper-upload-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-501 (F2b): an uploaded question paper (a SOURCE) becomes a draft PAPER with every item to review.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return Response.json(await createUploadedPaper(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 4000)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
