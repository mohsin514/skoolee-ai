import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "Dashboard | SkooleeAI".
  title: "Dashboard",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  const school = user
    ? await prisma.school.findUnique({ where: { id: user.schoolId }, select: { status: true } })
    : null;
  const isSuspended = school?.status === "SUSPENDED";

  return (
    <div className="flex min-h-screen bg-[#fbf0fe] font-sans text-[#1f1a23]">
      <Sidebar />
      <main className="skoolee-dashboard-main min-h-screen flex-1 pb-24 md:ml-64 md:pb-0">
        {isSuspended && (
          <div className="border-b border-amber-200 bg-amber-50/90 px-6 py-3 text-sm font-bold text-amber-800">
            Subscription suspended. Billing is still available so an administrator can restore access.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
