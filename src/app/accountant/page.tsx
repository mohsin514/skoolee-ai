"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  BarChart3,
  BookOpen,
  CalendarClock,
  FileText,
  Landmark,
  LayoutGrid,
  Layers,
  MessageCircle,
  Receipt,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getOperationsStaffDashboardData } from "@/app/actions/dashboard";
import { RoleShell } from "@/components/role-dashboard";
import type { SidebarEntry } from "@/components/role-dashboard/RoleSidebar";
import { FeeOverviewTab } from "@/components/fees/FeeOverviewTab";
import { FeeStructuresTab } from "@/components/fees/FeeStructuresTab";
import { FeeInvoicesTab } from "@/components/fees/FeeInvoicesTab";
import { FeePaymentsTab } from "@/components/fees/FeePaymentsTab";
import { FeeReportsTab } from "@/components/fees/FeeReportsTab";
import { FeeLayersTab } from "@/components/fees/FeeLayersTab";
import { AccountsTab } from "@/components/fees/AccountsTab";
import { PayrollPanel, LeaveManagementPanel } from "@/components/shared-admin/index";

type AccountantView =
  | "dashboard"
  | "fee-overview"
  | "fee-structures"
  | "fee-layers"
  | "invoices"
  | "payments"
  | "fee-reports"
  | "accounts"
  | "payroll"
  | "leave";

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
    {
      icon: Receipt, label: "Fees Management", children: [
        { label: "Overview", icon: Receipt, active: activeView === "fee-overview", onClick: () => setActiveView("fee-overview") },
        { label: "Structures", icon: BookOpen, active: activeView === "fee-structures", onClick: () => setActiveView("fee-structures") },
        { label: "Fee Layers", icon: Layers, active: activeView === "fee-layers", onClick: () => setActiveView("fee-layers") },
        { label: "Invoices", icon: FileText, active: activeView === "invoices", onClick: () => setActiveView("invoices") },
        { label: "Payments", icon: Wallet, active: activeView === "payments", onClick: () => setActiveView("payments") },
        { label: "Reports", icon: BarChart3, active: activeView === "fee-reports", onClick: () => setActiveView("fee-reports") },
        { label: "Accounts", icon: Landmark, active: activeView === "accounts", onClick: () => setActiveView("accounts") },
      ],
    },
    { label: "Payroll", icon: Banknote, active: activeView === "payroll", onClick: () => setActiveView("payroll") },
    { label: "Leave", icon: CalendarClock, active: activeView === "leave", onClick: () => setActiveView("leave") },
    { label: "Messages", icon: MessageCircle, href: "/messages" },
  ];

  return (
    <RoleShell
      tagline="Finance Console"
      eyebrow="Finance Console"
      navItems={navItems}
      userName={data.userName}
      userRole="Accountant"
      avatarSeed={data.userEmail}
      logoUrl={data.logoUrl}
      dashboardHref="/accountant"
    >
      <section className="flex-1 min-h-0 overflow-y-auto pr-1 pb-8 pt-2">
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
          {activeView === "dashboard" ? (
            <div className="space-y-6">
              <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] rounded-[32px] border border-[#cfc2d6]/25 p-7 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">{data.campusName}</p>
                  <h2 className="text-2xl font-black text-[#1f1a23]">Welcome, {data.userName}</h2>
                  <p className="text-sm text-ink-muted">Manage fees, payroll, and financial records for {data.schoolName}.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Fee Overview", icon: Receipt, view: "fee-overview" as AccountantView, color: "from-purple-500 to-violet-600" },
                  { label: "Invoices", icon: FileText, view: "invoices" as AccountantView, color: "from-blue-500 to-cyan-600" },
                  { label: "Payments", icon: Wallet, view: "payments" as AccountantView, color: "from-emerald-500 to-green-600" },
                  { label: "Payroll", icon: Banknote, view: "payroll" as AccountantView, color: "from-amber-500 to-orange-600" },
                ].map((card) => (
                  <button
                    key={card.label}
                    onClick={() => setActiveView(card.view)}
                    className="group relative overflow-hidden rounded-2xl border border-[#cfc2d6]/20 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className={`mb-3 inline-flex rounded-xl bg-gradient-to-br ${card.color} p-2.5 text-white shadow-lg`}>
                      <card.icon className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-bold text-[#1f1a23]">{card.label}</p>
                    <p className="mt-1 text-xs text-ink-muted">View &amp; manage</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {activeView === "fee-overview" ? <FeeOverviewTab campusId={data.campusId} onNavigate={() => {}} /> : null}
          {activeView === "fee-structures" ? <FeeStructuresTab campusId={data.campusId} /> : null}
          {activeView === "fee-layers" ? <FeeLayersTab campusId={data.campusId} /> : null}
          {activeView === "invoices" ? <FeeInvoicesTab campusId={data.campusId} /> : null}
          {activeView === "payments" ? <FeePaymentsTab campusId={data.campusId} /> : null}
          {activeView === "fee-reports" ? <FeeReportsTab campusId={data.campusId} /> : null}
          {activeView === "accounts" ? <AccountsTab campusId={data.campusId} /> : null}
          {activeView === "payroll" ? <PayrollPanel campusId={data.campusId} /> : null}
          {activeView === "leave" ? <LeaveManagementPanel campusId={data.campusId} /> : null}
        </div>
      </section>
    </RoleShell>
  );
}
