import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { ChatDock, ChatProvider } from "@/components/chat";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { dashboardPathForRole, isStaffRole } from "@/lib/roles";

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

  // Not one page under /dashboard checks who is asking — they are client
  // components that fetch and render. The route guard is the only gate, and a
  // gate in one place is a gate that can be widened by accident. Repeat it
  // here, where the pages actually mount, so a family account can never render
  // the staff roster, marks entry or billing even if the guard slips.
  if (!user) redirect("/login");
  if (!isStaffRole(user.role)) redirect(dashboardPathForRole(user.role));

  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { status: true },
  });
  const isSuspended = school?.status === "SUSPENDED";

  return (
    // This console predates RoleShell, so the messenger is mounted here too —
    // otherwise the school-group workspace would be the one dashboard without it.
    <ChatProvider>
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
        <ChatDock />
      </div>
    </ChatProvider>
  );
}
