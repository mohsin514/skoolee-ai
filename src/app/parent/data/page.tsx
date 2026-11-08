import { requirePageSession } from "@/lib/auth/require-page-session";
import { DataLifecyclePanel } from "@/components/settings/DataLifecyclePanel";

export const dynamic = "force-dynamic";

/**
 * SKAI-192: a guardian's data requests (export of their own child's records, then download once approved), inside
 * the family console. The API and panel serve guardians (SKO-447, SKAI-1159); since §6.3 moved data rules into the
 * institution consoles, this is the guardian's home for them and the old /settings/data link lands here.
 */
export default async function ParentDataPage() {
  const user = await requirePageSession();
  return <DataLifecyclePanel userId={user.userId} />;
}
