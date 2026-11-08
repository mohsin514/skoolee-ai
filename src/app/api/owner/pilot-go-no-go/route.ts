import { errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { goNoGoBoard } from "@/lib/pilots/go-no-go-service";

export const dynamic = "force-dynamic";

/** SKAI-1102: read-only pilot go/no-go board (platform owner only). */
export async function GET() {
  try {
    await requirePlatformOwner();
    return Response.json({ success: true, data: await goNoGoBoard() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "[owner/pilot-go-no-go] GET failed");
  }
}
