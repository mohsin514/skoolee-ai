import { errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { exportClaims } from "@/lib/pilots/service";

export const dynamic = "force-dynamic";

// SKO-430: aggregate, permissioned statements only — the external evidence export.
export async function GET() {
  try {
    await requirePlatformOwner();
    return Response.json({ success: true, data: await exportClaims() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "[owner/pilots/export] GET failed");
  }
}
