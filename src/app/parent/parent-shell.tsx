"use client";

import { CalendarCheck, Clock, CreditCard, FileText, LayoutGrid } from "lucide-react";
import { RoleShell, type RoleNavItem } from "@/components/role-dashboard";
import { useParentData } from "./parent-data-context";

export function ParentShell({ children }: { children: React.ReactNode }) {
  const { data, token } = useParentData();

  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const link = (path: string) => `${path}${q}`;

  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "Overview", href: link("/parent") },
    { icon: FileText, label: "Results", href: link("/parent/results") },
    { icon: CalendarCheck, label: "Attendance", href: link("/parent/attendance") },
    { icon: Clock, label: "Timetable", href: link("/parent/timetable") },
    { icon: CreditCard, label: "Fees", href: link("/parent/fees") },
  ];

  const child = data?.student;

  return (
    <RoleShell
      navItems={navItems}
      eyebrow="Parent Guardian Console"
      userName={child?.fullName || "Guardian"}
      userRole={child?.className || "Guardian Console"}
      avatarSeed={child?.fullName || "Parent"}
      logoUrl={data?.campus?.logoUrl || data?.campus?.school?.logoUrl}
      dashboardHref={link("/parent")}
    >
      {children}
    </RoleShell>
  );
}
