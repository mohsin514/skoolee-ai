import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { assertSchoolOperational, BillingAccessError } from "@/lib/billing/entitlements";
import OperationalLayout from "@/app/operational-layout";
import { SuperAdminDataProvider } from "./super-data-context";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "Group console | SkooleeAI".
  title: "Group console",
};

/**
 * F3 / §3.2: whether the school's subscription is paused, read once on the server for this page load. While
 * suspended the proxy admits only `/super?view=billing`; the console then renders its minimal shell (no chat
 * stream, every other view shows the paused notice) from the first paint, instead of finding out from a failed
 * dashboard load. Presentation only: every API keeps enforcing suspension itself.
 */
async function schoolSuspended(schoolId: string): Promise<boolean> {
  try {
    await assertSchoolOperational(schoolId);
    return false;
  } catch (error) {
    return error instanceof BillingAccessError && error.status === 402;
  }
}

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  const suspended = await schoolSuspended(user.schoolId);
  return (
    <SuperAdminDataProvider
      key={JSON.stringify([user.userId, user.schoolId, user.campusId, user.role, user.accessVersion ?? 0])}
      initialSuspended={suspended}
    >
      <OperationalLayout>{children}</OperationalLayout>
    </SuperAdminDataProvider>
  );
}
