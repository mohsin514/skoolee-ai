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
import {
  ConsolePage,
  ConsoleQuickLink,
  ConsoleSkeleton,
  type ConsoleNavItem,
} from "@/components/operations/console-page";
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

/**
 * One list drives the section strip, the sidebar and the page header, so the
 * three can never drift apart — the discipline the teacher console already
 * uses. Grouping marks where the console stops being about fees.
 */
const NAV: ConsoleNavItem<AccountantView>[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid, tone: "brand", group: "Overview", eyebrow: "Finance Console", summary: "Fees, payroll and financial records at a glance." },
  { id: "fee-overview", label: "Overview", icon: Receipt, tone: "fees", group: "Fees", eyebrow: "Fees", summary: "Collection totals and outstanding balances." },
  { id: "fee-structures", label: "Structures", icon: BookOpen, tone: "fees", group: "Fees", eyebrow: "Fees", summary: "Per-class monthly fees and their effective dates." },
  { id: "fee-layers", label: "Fee Layers", icon: Layers, tone: "fees", group: "Fees", eyebrow: "Fees", summary: "Discounts, one-time charges and per-student overrides." },
  { id: "invoices", label: "Invoices", icon: FileText, tone: "fees", group: "Fees", eyebrow: "Fees", summary: "Generate, review and send invoices." },
  { id: "payments", label: "Payments", icon: Wallet, tone: "fees", group: "Fees", eyebrow: "Fees", summary: "Record receipts and reconcile against invoices." },
  { id: "fee-reports", label: "Reports", icon: BarChart3, tone: "reports", group: "Fees", eyebrow: "Fees", summary: "Collection, defaulter and ledger reports." },
  { id: "accounts", label: "Accounts", icon: Landmark, tone: "fees", group: "Fees", eyebrow: "Fees", summary: "Opening balances and account-level adjustments." },
  { id: "payroll", label: "Payroll", icon: Banknote, tone: "staff", group: "Staff", eyebrow: "Staff", summary: "Salaries, allowances and monthly payroll runs." },
  { id: "leave", label: "Leave", icon: CalendarClock, tone: "leave", group: "Staff", eyebrow: "Staff", summary: "Review and decide staff leave requests." },
];

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

  // The sidebar mirrors the same list. Messaging is not an accountant "view",
  // so it is appended as a link.
  const navItems: SidebarEntry[] = [
    ...NAV.map((item) => ({
      label: item.label,
      icon: item.icon,
      active: activeView === item.id,
      onClick: () => setActiveView(item.id),
    })),
    { label: "Messages", icon: MessageCircle, href: "/messages" },
  ];

  const current = NAV.find((item) => item.id === activeView) ?? NAV[0];

  return (
    <RoleShell
      tagline="Finance Console"
      eyebrow="Finance Console"
      navItems={navItems}
      userName={data?.userName || "Accountant"}
      userRole="Accountant"
      avatarSeed={data?.userEmail}
      logoUrl={data?.logoUrl}
      dashboardHref="/accountant"
    >
      {loading || !data ? (
        <ConsoleSkeleton label="Loading the finance console" />
      ) : (
        <ConsolePage
          items={NAV}
          activeId={activeView}
          onSelect={setActiveView}
          navLabel="Finance sections"
          icon={current.icon}
          tone={current.tone}
          eyebrow={current.eyebrow ?? "Finance Console"}
          title={activeView === "dashboard" ? data.userName : current.label}
          summary={
            activeView === "dashboard"
              ? `${data.campusName}${data.campusCity ? ` · ${data.campusCity}` : ""} · ${data.schoolName}`
              : current.summary
          }
        >
          {activeView === "dashboard" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {NAV.filter((item) => item.id !== "dashboard").map((item) => (
                <ConsoleQuickLink
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  description={item.summary ?? ""}
                  tone={item.tone}
                  onClick={() => setActiveView(item.id)}
                />
              ))}
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
        </ConsolePage>
      )}
    </RoleShell>
  );
}
