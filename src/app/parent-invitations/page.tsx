import { Suspense } from "react";
import { ParentInvitations } from "@/components/ParentInvitations";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { getDisplayLocale } from "@/lib/locale/display";
import { dashboardPathForRole } from "@/lib/roles";
import { ParentDataProvider } from "@/app/parent/parent-data-context";
import { ParentShell } from "@/app/parent/parent-shell";

export const dynamic = "force-dynamic";

/**
 * Guardian invitations (§6.3: kept, inside the parent shell). The page renders in the family console itself —
 * the same ParentShell and data provider as /parent — so its sidebar and mobile bar follow the guardian's own
 * per-child permissions, the child switcher is in the header, and the page sits in the shell's one page card
 * (G20). A guardian with no linked child yet gets Home and this page only. Home shows a banner while any wait.
 */
export default async function ParentInvitationsPage() {
  const user = await requirePageSession();
  if (user.role !== "PARENT") redirect(dashboardPathForRole(user.role));
  // The same identity key as the family console's layout (its remembered navigation map is trusted only for it).
  const identity = [user.userId, user.schoolId, user.role, String(user.accessVersion ?? 0)].join("|");
  // SKO-490: the account's saved language (server-resolved), never the browser's, from first paint onwards.
  return (
    <LocaleProvider initialLocale={await getDisplayLocale(user)}>
      <Suspense>
        <ParentDataProvider identity={identity}>
          <ParentShell>
            <ParentInvitations />
          </ParentShell>
        </ParentDataProvider>
      </Suspense>
    </LocaleProvider>
  );
}
