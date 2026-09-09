import { Suspense } from "react";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { ParentDataProvider } from "./parent-data-context";
import { ParentShell } from "./parent-shell";

export const metadata = {
  title: "Parent Portal - SkooleeAI",
  description: "View your child's academic results, attendance, and fee status",
};

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  // This gate matters more here than on any other console, because `/parent` is
  // listed in the proxy's PUBLIC_PATHS — and that list matches by prefix, so the
  // *entire* subtree (results, attendance, fees, timetable) is exempt from the
  // route guard. Nothing under it was ever checked server-side; the pages simply
  // fetched, and the APIs behind them refused. So there was no point at which a
  // signed-out or revoked visitor was turned away from a guardian's portal
  // before it rendered.
  //
  // Gating the layout closes that for real. The narrower fix — dropping /parent
  // from PUBLIC_PATHS — is the one worth discussing separately: nothing under
  // here serves an anonymous visitor, so the entry looks like an oversight, but
  // removing it changes proxy behaviour for a route family beyond the scope of
  // this change.
  await requirePageSession();

  return (
    <Suspense>
      <ParentDataProvider>
        <ParentShell>{children}</ParentShell>
      </ParentDataProvider>
    </Suspense>
  );
}