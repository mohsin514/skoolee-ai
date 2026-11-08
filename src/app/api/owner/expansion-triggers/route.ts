import { requirePlatformOwner } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { EXPANSION_OBSERVATIONS } from "@/lib/expansion/trigger-config";
import { evaluateExpansionTriggers } from "@/lib/expansion/triggers";

export const dynamic = "force-dynamic";

/** SKAI-1108: market expansion triggers with met/not-met state (platform owner only, read-only). */
export async function GET() {
  try {
    await requirePlatformOwner();
    return ok({ asOf: EXPANSION_OBSERVATIONS.asOf, triggers: evaluateExpansionTriggers() });
  } catch (error) {
    return failFrom(error, "[owner/expansion-triggers] GET failed");
  }
}
