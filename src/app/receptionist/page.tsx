"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Eye,
  FileText,
  LayoutGrid,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
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
import {
  VisitorsPanel,
  ComplaintsPanel,
  PostalPanel,
  PhoneCallsPanel,
  CertificatesPanel,
} from "@/components/operations";
import { LeaveManagementPanel } from "@/components/shared-admin/index";

type ReceptionistView = "dashboard" | "visitors" | "complaints" | "postal" | "phone-calls" | "certificates" | "leave";

/** One list drives the section strip, the sidebar and the page header. */
const NAV: ConsoleNavItem<ReceptionistView>[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid, tone: "brand", group: "Overview", eyebrow: "Front Desk Console", summary: "Everything the front desk handles, in one place." },
  { id: "visitors", label: "Visitors", icon: Eye, tone: "students", group: "Front Desk", eyebrow: "Front Desk", summary: "Log arrivals, passes and sign-outs." },
  { id: "complaints", label: "Complaints", icon: MessageSquare, tone: "exams", group: "Front Desk", eyebrow: "Front Desk", summary: "Record complaints and track them to resolution." },
  { id: "postal", label: "Postal", icon: Mail, tone: "timetable", group: "Front Desk", eyebrow: "Front Desk", summary: "Inbound and outbound post and courier records." },
  { id: "phone-calls", label: "Phone Calls", icon: Phone, tone: "classes", group: "Front Desk", eyebrow: "Front Desk", summary: "Call log with callers, purpose and follow-ups." },
  { id: "certificates", label: "Certificates", icon: FileText, tone: "reports", group: "Records", eyebrow: "Records", summary: "Issue and reprint student certificates." },
  { id: "leave", label: "Leave", icon: CalendarClock, tone: "leave", group: "Records", eyebrow: "Staff", summary: "Apply for leave and track your requests." },
];

export default function ReceptionistPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ReceptionistView>("dashboard");

  const loadData = useCallback(async () => {
    try {
      const d = await getOperationsStaffDashboardData();
      if (d.userRole !== "RECEPTIONIST") {
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
      tagline="Front Desk Console"
      eyebrow="Front Desk Console"
      navItems={navItems}
      userName={data?.userName || "Receptionist"}
      userRole="Receptionist"
      avatarSeed={data?.userEmail}
      logoUrl={data?.logoUrl}
      dashboardHref="/receptionist"
    >
      {loading || !data ? (
        <ConsoleSkeleton label="Loading the front desk console" cards={3} />
      ) : (
        <ConsolePage
          items={NAV}
          activeId={activeView}
          onSelect={setActiveView}
          navLabel="Front desk sections"
          icon={current.icon}
          tone={current.tone}
          eyebrow={current.eyebrow ?? "Front Desk Console"}
          title={activeView === "dashboard" ? data.userName : current.label}
          summary={
            activeView === "dashboard"
              ? `${data.campusName}${data.campusCity ? ` · ${data.campusCity}` : ""} · ${data.schoolName}`
              : current.summary
          }
        >
          {/* This view used to be a welcome banner and nothing else — the one
              console whose dashboard offered no way into its own six tools. */}
          {activeView === "dashboard" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          {activeView === "visitors" ? <VisitorsPanel /> : null}
          {activeView === "complaints" ? <ComplaintsPanel /> : null}
          {activeView === "postal" ? <PostalPanel /> : null}
          {activeView === "phone-calls" ? <PhoneCallsPanel /> : null}
          {activeView === "certificates" ? <CertificatesPanel /> : null}
          {activeView === "leave" ? <LeaveManagementPanel campusId={data.campusId} /> : null}
        </ConsolePage>
      )}
    </RoleShell>
  );
}
