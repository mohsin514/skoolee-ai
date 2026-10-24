import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { orphanRouteTarget } from "@/lib/navigation/legacy-redirects";

export const dynamic = "force-dynamic";

/** SPEC §6.3 — integrations and API keys belong to the institution authority's settings (Settings › Integrations / School settings › Integrations). */
export default async function IntegrationsPage() {
  const user = await requirePageSession();
  redirect(orphanRouteTarget("integrations", user)); // outside try/catch
}
