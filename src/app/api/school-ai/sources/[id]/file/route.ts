import { assertOriginalAvailable } from "@/lib/school-ai/document-jobs-service";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { ApiError } from "@/lib/api/scope";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { getWorkspaceRecord, assertSourceOriginalAccess } from "@/lib/school-ai/repository";
import { readOriginal } from "@/lib/school-ai/source-storage";
import { schoolAiError } from "@/lib/school-ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSchoolAiUser("view");
    const record = await getWorkspaceRecord(user, (await context.params).id);
    if (record.kind !== "SOURCE" || typeof record.data.storageKey !== "string" || !record.data.storageKey.startsWith(`school-ai/${user.schoolId}/`)) throw new ApiError("Original source is unavailable.", 404);
    await schoolAiTransaction(user,async tx=>{ await assertSourceOriginalAccess(user,record.id,tx); await assertOriginalAvailable(user,record.id,tx); });
    const bytes = await readOriginal(record.data.storageKey);
    const mime = String(record.data.mimeType);
    const safeMime = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv"].includes(mime) ? mime : "application/octet-stream";
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": safeMime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(record.data.fileName || "source"))}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'",
    } });
  } catch (error) { return schoolAiError(error); }
}
