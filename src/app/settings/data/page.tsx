import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { orphanRouteTarget } from "@/lib/navigation/legacy-redirects";

export const dynamic = "force-dynamic";

/** SPEC §6.3 — data rules live in the institution authority's settings: the group admin's Settings › Data, the school admin's School settings › Data. Everyone else goes home. */
export default async function DataLifecycleSettingsPage() {
  const user = await requirePageSession();
  redirect(orphanRouteTarget("settings-data", user)); // outside try/catch
}
