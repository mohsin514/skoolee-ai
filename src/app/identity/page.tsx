import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { orphanRouteTarget } from "@/lib/navigation/legacy-redirects";

export const dynamic = "force-dynamic";

/** SPEC §6.3 — sign-in and roster sync belong to the institution authority's settings (Settings › Identity / School settings › Identity). */
export default async function IdentityPage() {
  const user = await requirePageSession();
  redirect(orphanRouteTarget("identity", user)); // outside try/catch
}
