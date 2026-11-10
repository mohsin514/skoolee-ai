import { requirePlatformOwner } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { goNoGoBoard } from "@/lib/pilots/go-no-go-service";

export const dynamic = "force-dynamic";

/** SKAI-1102: read-only pilot go/no-go board (platform owner only). */
export async function GET() {
  try {
    await requirePlatformOwner();
    return ok(await goNoGoBoard(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failFrom(error, "[owner/pilot-go-no-go] GET failed");
  }
}
