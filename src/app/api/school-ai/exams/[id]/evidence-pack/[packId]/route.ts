import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { downloadEvidencePack } from "@/lib/school-ai/evidence-pack-service";

export const dynamic = "force-dynamic";
// SKO-408 R19.8: the stored pack as a ZIP (manifest.json plus every listed file); each download is audited.
export async function GET(_request: Request, context: { params: Promise<{ id: string; packId: string }> }) {
  try {
    const { id, packId } = await context.params;
    const { filename, archive } = await downloadEvidencePack(await requireAuthUser(), id, packId);
    return new Response(new Uint8Array(archive), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return schoolAiError(error); }
}
