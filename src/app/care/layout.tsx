import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { prisma } from "@/lib/db/prisma";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { redirect } from "next/navigation";
import { dashboardPathForRole } from "@/lib/roles";

export default async function CareLayout({ children }: { children: React.ReactNode }) {
  // SKO-439: confidential care, framed in the caller's own console (SPEC §6.3). The API decides every workspace and record.
  const user = await requirePageSession();
  // Families and the platform operator have no place here; the proxy sends them home first (G44).
  if (user.role === "PARENT" || user.role === "STUDENT" || user.role === "APP_OWNER") redirect(dashboardPathForRole(user.role));
  // Campus logo, else school logo: what the console's own sidebar shows (dashboard.ts). Read on the server so
  // the first paint has it (the session's `logoUrl` arrives only after the client's read); a failed read only costs the image.
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoUrl: true, campuses: { where: { id: user.campusId ?? "" }, select: { logoUrl: true } } } }).catch(() => null);
  return (
    <LocaleProvider initialLocale={await getDisplayLocale(user)}>
      <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.campuses[0]?.logoUrl || brand?.logoUrl || null} chatDock={user.schoolStatus !== "SUSPENDED"}>{children}</RoleFrame>
    </LocaleProvider>
  );
}
