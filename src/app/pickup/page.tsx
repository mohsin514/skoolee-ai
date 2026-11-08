import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { orphanRouteTarget } from "@/lib/navigation/legacy-redirects";

export const dynamic = "force-dynamic";

/** SPEC §6.3 — the pickup gate is a view of the front desk (receptionist) and the campus console (exception decisions); families authorise collectors under Pickup & transport. */
export default async function PickupPage() {
  const user = await requirePageSession();
  redirect(orphanRouteTarget("pickup", user)); // outside try/catch
}
