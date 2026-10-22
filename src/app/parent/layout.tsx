import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { dashboardPathForRole } from "@/lib/roles";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { getDisplayLocale } from "@/lib/locale/display";
import { ParentDataProvider } from "./parent-data-context";
import { ParentShell } from "./parent-shell";

export const metadata = {
  // The root layout's "%s | SkooleeAI" template adds the brand; repeating it
  // here rendered "Parent Portal - SkooleeAI | SkooleeAI" in the tab.
  title: "Parent Portal",
  description: "View your child's academic results, attendance, and fee status",
};

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  // The family portal needs a signed-in guardian: there is no anonymous or token-link access (portal
  // links are retired, D14; `/parent` left the proxy's PUBLIC_PATHS with them). The proxy's role guard
  // (G44) keeps every other role out; this gate turns a signed-out or revoked visitor away before render.
  const user = await requirePageSession();
  // Defence in depth behind the proxy's role guard (G44): only the console's own role renders it; anyone
  // else goes to their own home (outside any try/catch — redirect() throws).
  if (user.role !== "PARENT") redirect(dashboardPathForRole(user.role));

  // Whose family console this is (user · school · role · access version): the data provider trusts its remembered
  // navigation map only for this exact identity (addendum 2026-10-22 §3).
  const identity = [user.userId, user.schoolId, user.role, String(user.accessVersion ?? 0)].join("|");

  // Server-seeded so the shell's first paint has the right language; the shell's own provider becomes a passthrough.
  return (
    <LocaleProvider initialLocale={await getDisplayLocale(user)}>
      <Suspense>
        <ParentDataProvider identity={identity}>
          <ParentShell>{children}</ParentShell>
        </ParentDataProvider>
      </Suspense>
    </LocaleProvider>
  );
}