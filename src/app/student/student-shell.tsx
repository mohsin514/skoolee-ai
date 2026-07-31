"use client";

import { useRouter } from "next/navigation";
import { BookOpen, Calendar, CalendarCheck, Clock, CreditCard, FileText, HelpCircle, LayoutGrid, LogOut } from "lucide-react";
import { toast } from "sonner";
import { RoleShell, type RoleNavItem } from "@/components/role-dashboard";

export function StudentShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "Dashboard", href: "/student" },
    { icon: BookOpen, label: "Coursework", href: "/student/coursework" },
    { icon: CalendarCheck, label: "Attendance", href: "/student/attendance" },
    { icon: Calendar, label: "Schedule", href: "/student/schedule" },
    { icon: Clock, label: "Timetable", href: "/student/timetable" },
    { icon: FileText, label: "Report Cards", href: "/student/reports" },
    { icon: CreditCard, label: "Fee Tokens", href: "/student/fees" },
  ];
  const bottomItems: RoleNavItem[] = [];

  return (
    <RoleShell
      navItems={navItems}
      bottomItems={bottomItems}
      eyebrow="Official Academic Transcript"
      userName="Student"
      userRole="Student Console"
      avatarSeed="Student"
      dashboardHref="/student"
    >
      {children}
    </RoleShell>
  );
}
