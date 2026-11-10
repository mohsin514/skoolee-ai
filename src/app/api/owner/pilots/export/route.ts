import { requirePlatformOwner } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { exportClaims } from "@/lib/pilots/service";

export const dynamic = "force-dynamic";

// SKO-430: aggregate, permissioned statements only — the external evidence export.
export async function GET() {
  try {
    await requirePlatformOwner();
    return ok(await exportClaims(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failFrom(error, "[owner/pilots/export] GET failed");
  }
}
