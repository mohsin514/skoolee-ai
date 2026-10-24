import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { orphanRouteTarget } from "@/lib/navigation/legacy-redirects";

export const dynamic = "force-dynamic";

/** SPEC §6.3 — the finance desk drafts tax packages (Finance desk › Tax packages) and the institution authority signs them off (Approvals › Tax). */
export default async function TaxPackagesPage() {
  const user = await requirePageSession();
  redirect(orphanRouteTarget("tax-packages", user)); // outside try/catch
}
