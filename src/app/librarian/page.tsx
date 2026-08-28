"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CalendarClock,
  LayoutGrid,
  MessageCircle,
  Package,
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
import { LibraryPanel, InventoryPanel } from "@/components/operations";
import { LeaveManagementPanel } from "@/components/shared-admin/index";

type LibrarianView = "dashboard" | "library" | "inventory" | "leave";

/** One list drives the section strip, the sidebar and the page header. */
const NAV: ConsoleNavItem<LibrarianView>[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid, tone: "brand", eyebrow: "Library Console", summary: "Books, members and stock at a glance." },
  { id: "library", label: "Library", icon: BookOpen, tone: "classes", eyebrow: "Library", summary: "Catalogue, members, and issue or return books." },
  { id: "inventory", label: "Inventory", icon: Package, tone: "staff", eyebrow: "Library", summary: "Items, stores and suppliers." },
  { id: "leave", label: "Leave", icon: CalendarClock, tone: "leave", eyebrow: "Staff", summary: "Apply for leave and track your requests." },
];

export default function LibrarianPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<LibrarianView>("dashboard");

  const loadData = useCallback(async () => {
    try {
      const d = await getOperationsStaffDashboardData();
      if (d.userRole !== "LIBRARIAN") {
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
      tagline="Library Console"
      eyebrow="Library Console"
      navItems={navItems}
      userName={data?.userName || "Librarian"}
      userRole="Librarian"
      avatarSeed={data?.userEmail}
      logoUrl={data?.logoUrl}
      dashboardHref="/librarian"
    >
      {loading || !data ? (
        <ConsoleSkeleton label="Loading the library console" cards={3} />
      ) : (
        <ConsolePage
          items={NAV}
          activeId={activeView}
          onSelect={setActiveView}
          navLabel="Library sections"
          icon={current.icon}
          tone={current.tone}
          eyebrow={current.eyebrow ?? "Library Console"}
          title={activeView === "dashboard" ? data.userName : current.label}
          summary={
            activeView === "dashboard"
              ? `${data.campusName}${data.campusCity ? ` · ${data.campusCity}` : ""} · ${data.schoolName}`
              : current.summary
          }
        >
          {activeView === "dashboard" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          {activeView === "library" ? <LibraryPanel /> : null}
          {activeView === "inventory" ? <InventoryPanel /> : null}
          {activeView === "leave" ? <LeaveManagementPanel campusId={data.campusId} /> : null}
        </ConsolePage>
      )}
    </RoleShell>
  );
}
