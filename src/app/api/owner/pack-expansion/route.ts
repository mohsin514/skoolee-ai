import { errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { clientIp } from "@/lib/http/client-ip";
import { listExpansionStatus, recordExpansionDecision } from "@/lib/school-ai/pack-expansion-store";

export const dynamic = "force-dynamic";

/** SKAI-1019/1020: deferred pack candidates, current decision and blocking prerequisites (platform owner only). */
export async function GET() {
  try {
    await requirePlatformOwner();
    return Response.json({ success: true, data: await listExpansionStatus() });
  } catch (error) {
    return errorResponse(error, "[owner/pack-expansion] GET failed");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePlatformOwner();
    const body = await request.json().catch(() => null);
    const row = await recordExpansionDecision(user, body?.record, { ipAddress: clientIp(request.headers), userAgent: request.headers.get("user-agent") || undefined });
    return Response.json({ success: true, data: { id: row.id, outcome: row.outcome } });
  } catch (error) {
    return errorResponse(error, "[owner/pack-expansion] POST failed");
  }
}
