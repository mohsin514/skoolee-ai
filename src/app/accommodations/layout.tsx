import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { prisma } from "@/lib/db/prisma";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { redirect } from "next/navigation";
import { dashboardPathForRole } from "@/lib/roles";
import { canLeadAcademics } from "@/lib/api/scope";

export default async function AccommodationsLayout({ children }: { children: React.ReactNode }) {
  // Assessment access plans for the academic lead, framed in the caller's console. Teachers and families have their own pages.
  const user = await requirePageSession();
  if (user.role === "TEACHER") redirect("/teacher/accommodations");
  if (user.role === "PARENT") redirect("/parent/access");
  if (user.role === "STUDENT") redirect("/student/access");
  // SPEC §6.3: the principal, or a campus operator while the campus has no principal (`academicLead`). Everyone else,
  // including a campus admin whose campus has a principal, goes home. A failed seat read fails closed.
  const academicLead = await canLeadAcademics(user).catch(() => false);
  if (!academicLead) redirect(dashboardPathForRole(user.role));
  // Campus logo, else school logo: what the console's own sidebar shows (dashboard.ts). Read on the server so
  // the first paint has it (the session's `logoUrl` arrives only after the client's read); a failed read only costs the image.
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoUrl: true, campuses: { where: { id: user.campusId ?? "" }, select: { logoUrl: true } } } }).catch(() => null);
  return (
    <LocaleProvider initialLocale={await getDisplayLocale(user)}>
      <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.campuses[0]?.logoUrl || brand?.logoUrl || null} chatDock={user.schoolStatus !== "SUSPENDED"}>{children}</RoleFrame>
    </LocaleProvider>
  );
}
