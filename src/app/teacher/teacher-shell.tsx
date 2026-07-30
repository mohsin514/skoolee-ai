"use client";

import { useRouter } from "next/navigation";
import { BookOpen, Calendar, CalendarCheck, FileText, HelpCircle, LogOut, Star, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { RoleShell, type RoleNavItem } from "@/components/role-dashboard";
import { useTeacherData } from "./teacher-data-context";

export function TeacherShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data } = useTeacherData();
  const teacherName = data?.teacherName || "Teacher";

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const navItems: RoleNavItem[] = [
    { icon: BookOpen, label: "Dashboard", href: "/teacher" },
    { icon: CalendarCheck, label: "Attendance", href: "/teacher/attendance" },
    { icon: Star, label: "Marks & Tests", href: "/teacher/marks" },
    { icon: Users, label: "My Students", href: "/teacher/students" },
    { icon: FileText, label: "Reports", href: "/teacher/reports" },
    { icon: Calendar, label: "Timetable", href: "/teacher/timetable" },
    { icon: Zap, label: "AI Insights", href: "/teacher/ai" },
  ];
  const bottomItems: RoleNavItem[] = [
    { icon: HelpCircle, label: "Help & Support", onClick: () => toast.info("Teacher support is available from this role workspace.") },
    { icon: LogOut, label: "Sign Out", onClick: handleLogout },
  ];

  return (
    <RoleShell
      navItems={navItems}
      bottomItems={bottomItems}
      eyebrow="My Academic Workspace"
      userName={teacherName}
      userRole="Faculty Console"
      avatarSeed={teacherName}
      dashboardHref="/teacher"
    >
      {children}
    </RoleShell>
  );
}
