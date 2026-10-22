import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { prisma } from "@/lib/db/prisma";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

// §7.3: every route segment carries a distinct <title>; the root layout
// supplies the "%s | SkooleeAI" template.
export const metadata: Metadata = { title: "Messages" };

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  // The full-page messenger for every school role, framed in the caller's console. The page owns its chat stream, so the floating dock is off.
  const user = await requirePageSession();
  if (user.role === "APP_OWNER") redirect("/owner");
  // Campus logo, else school logo: what the console's own sidebar shows (dashboard.ts). Read on the server so
  // the first paint has it (the session's `logoUrl` arrives only after the client's read); a failed read only costs the image.
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoUrl: true, campuses: { where: { id: user.campusId ?? "" }, select: { logoUrl: true } } } }).catch(() => null);
  return (
    <LocaleProvider initialLocale={await getDisplayLocale(user)}>
      <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.campuses[0]?.logoUrl || brand?.logoUrl || null} chatDock={false}>{children}</RoleFrame>
    </LocaleProvider>
  );
}
