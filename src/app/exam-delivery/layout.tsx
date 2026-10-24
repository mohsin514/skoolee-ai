import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { prisma } from "@/lib/db/prisma";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { redirect } from "next/navigation";
import { dashboardPathForRole } from "@/lib/roles";
import { canLeadAcademics } from "@/lib/api/scope";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Secure exam delivery" };

export default async function ExamDeliveryLayout({ children }: { children: React.ReactNode }) {
  // Secure exam delivery profiles for the academic lead, framed in the caller's console (SPEC §6.3): the principal, or
  // a campus operator while the campus has no principal (`academicLead`, the same predicate as the registry leaf and
  // the exam routes). Everyone else goes home, never to a dead-end notice inside the frame. A failed seat read fails closed.
  const user = await requirePageSession();
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
