"use client";

import { RoleSidebar } from "@/components/role-dashboard/RoleSidebar";
import { NavigationAccessProvider } from "@/components/nav/NavigationAccess";
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Settings,
  Users,
  Network,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/students", label: "Students", icon: Users },
  { href: "/dashboard/classes", label: "Classes", icon: GraduationCap },
  { href: "/dashboard/staff-hierarchy", label: "Staff Hierarchy", icon: Network },
  { href: "/dashboard/marks", label: "Marks Entry", icon: ClipboardList },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/communications", label: "Communications", icon: MessageCircle },
  { href: "/messages", label: "Messages", icon: MessagesSquare },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  return <NavigationAccessProvider><RoleSidebar tagline="Campus Console" items={navItems} bottomItems={[{
    label: "Sign out", icon: LogOut, onClick: async () => {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (response.ok) window.location.href = "/login";
    },
  }]} /></NavigationAccessProvider>;
}
