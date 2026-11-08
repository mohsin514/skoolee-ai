import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { orphanRouteTarget } from "@/lib/navigation/legacy-redirects";

export const dynamic = "force-dynamic";

/** SPEC §6.3 — group policy is a group standard: the group admin's Group standards › Policies; a group campus admin reads it and requests exceptions in Campus setup. */
export default async function GroupPolicyPage() {
  const user = await requirePageSession();
  redirect(orphanRouteTarget("group-policy", user)); // outside try/catch
}
