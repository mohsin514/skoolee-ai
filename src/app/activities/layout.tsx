import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { prisma } from "@/lib/db/prisma";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { redirect } from "next/navigation";
import { dashboardPathForRole } from "@/lib/roles";

export default async function ActivitiesLayout({ children }: { children: React.ReactNode }) {
  // SKO-440: the activities desk for coordinators and campus operators, framed in the caller's console. Families use Activities & trips.
  const user = await requirePageSession();
  if (user.role === "PARENT") redirect("/parent/activities");
  // Learners and the platform operator have no place here; the proxy sends them home first (G44).
  if (user.role === "STUDENT" || user.role === "APP_OWNER") redirect(dashboardPathForRole(user.role));
  // Campus logo, else school logo: what the console's own sidebar shows (dashboard.ts). Read on the server so
  // the first paint has it (the session's `logoUrl` arrives only after the client's read); a failed read only costs the image.
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoUrl: true, campuses: { where: { id: user.campusId ?? "" }, select: { logoUrl: true } } } }).catch(() => null);
  return (
    <LocaleProvider initialLocale={await getDisplayLocale(user)}>
      <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.campuses[0]?.logoUrl || brand?.logoUrl || null} chatDock={user.schoolStatus !== "SUSPENDED"}>{children}</RoleFrame>
    </LocaleProvider>
  );
}
