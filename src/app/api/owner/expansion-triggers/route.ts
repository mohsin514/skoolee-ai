import { errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { EXPANSION_OBSERVATIONS } from "@/lib/expansion/trigger-config";
import { evaluateExpansionTriggers } from "@/lib/expansion/triggers";

export const dynamic = "force-dynamic";

/** SKAI-1108: market expansion triggers with met/not-met state (platform owner only, read-only). */
export async function GET() {
  try {
    await requirePlatformOwner();
    return Response.json({ success: true, data: { asOf: EXPANSION_OBSERVATIONS.asOf, triggers: evaluateExpansionTriggers() } });
  } catch (error) {
    return errorResponse(error, "[owner/expansion-triggers] GET failed");
  }
}
