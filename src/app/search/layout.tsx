import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { prisma } from "@/lib/db/prisma";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { redirect } from "next/navigation";
import { dashboardPathForRole } from "@/lib/roles";
import { ROLE_NAV, consoleForRole } from "@/lib/navigation/role-nav";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Search records" };

export default async function SearchLayout({ children }: { children: React.ReactNode }) {
  // SKO-401: record search for the roles that look people up (campus admin, school admin, principal, reception), framed in
  // their console. The registry's `recordSearch` names those consoles (SPEC §6.3: others home, never an access notice).
  const user = await requirePageSession();
  if (!ROLE_NAV[consoleForRole(user.role)]?.recordSearch) redirect(dashboardPathForRole(user.role));
  // Campus logo, else school logo: what the console's own sidebar shows (dashboard.ts). Read on the server so
  // the first paint has it (the session's `logoUrl` arrives only after the client's read); a failed read only costs the image.
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoUrl: true, campuses: { where: { id: user.campusId ?? "" }, select: { logoUrl: true } } } }).catch(() => null);
  return (
    <LocaleProvider initialLocale={await getDisplayLocale(user)}>
      <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.campuses[0]?.logoUrl || brand?.logoUrl || null} chatDock={user.schoolStatus !== "SUSPENDED"}>{children}</RoleFrame>
    </LocaleProvider>
  );
}
