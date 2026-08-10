"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, CalendarClock, LayoutGrid, Receipt, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getOperationsStaffDashboardData } from "@/app/actions/dashboard";
import { RoleShell } from "@/components/role-dashboard";
import type { SidebarEntry } from "@/components/role-dashboard/RoleSidebar";
import { FeesPanel } from "@/components/fees/FeesPanel";
import { PayrollPanel, LeaveManagementPanel } from "@/components/shared-admin/index";

type AccountantView = "dashboard" | "fees" | "payroll" | "leave";

export default function AccountantPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<AccountantView>("dashboard");

  const loadData = useCallback(async () => {
    try {
      const d = await getOperationsStaffDashboardData();
      if (d.userRole !== "ACCOUNTANT") {
        router.replace("/login");
        return;
      }
      setData(d);
    } catch {
      toast.error("Failed to load dashboard");
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#fbf0fe] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#8127cf] border-t-transparent animate-spin" />
      </div>
    );
  }

  const navItems: SidebarEntry[] = [
    { label: "Dashboard", icon: LayoutGrid, active: activeView === "dashboard", onClick: () => setActiveView("dashboard") },
    { label: "Fees", icon: Receipt, active: activeView === "fees", onClick: () => setActiveView("fees") },
    { label: "Payroll", icon: Banknote, active: activeView === "payroll", onClick: () => setActiveView("payroll") },
    { label: "Leave", icon: CalendarClock, active: activeView === "leave", onClick: () => setActiveView("leave") },
  ];

  return (
    <RoleShell
      tagline="Finance Console"
      eyebrow="Finance Console"
      navItems={navItems}
      userName={data.userName}
      userRole="Accountant"
      avatarSeed={data.userEmail}
      dashboardHref="/accountant"
    >
      <section className="flex-1 min-h-0 overflow-y-auto pr-1 pb-8 pt-2">
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
          {activeView === "dashboard" ? (
            <div className="space-y-6">
              <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] rounded-[32px] border border-[#cfc2d6]/25 p-7 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/40">{data.campusName}</p>
                  <h2 className="text-2xl font-black text-[#1f1a23]">Welcome, {data.userName}</h2>
                  <p className="text-sm text-[#4d4354]/60">Manage fees, payroll, and financial records for {data.schoolName}.</p>
                </div>
              </div>
            </div>
          ) : null}
          {activeView === "fees" ? <FeesPanel campusId={data.campusId} /> : null}
          {activeView === "payroll" ? <PayrollPanel campusId={data.campusId} /> : null}
          {activeView === "leave" ? <LeaveManagementPanel campusId={data.campusId} /> : null}
        </div>
      </section>
    </RoleShell>
  );
}
