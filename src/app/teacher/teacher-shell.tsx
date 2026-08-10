"use client";

import { useRouter } from "next/navigation";
import { BookOpen, Calendar, CalendarCheck, FileText, HelpCircle, LogOut, Plane, Star, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { RoleShell, type RoleNavItem } from "@/components/role-dashboard";
import { CycleProvider, CycleGate } from "@/components/academic-year/CycleGate";
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
    { icon: Plane, label: "Leave", href: "/teacher/leave" },
    { icon: Zap, label: "AI Insights", href: "/teacher/ai" },
  ];
  const bottomItems: RoleNavItem[] = [];

  return (
    <CycleProvider>
      <RoleShell
        navItems={navItems}
        bottomItems={bottomItems}
        eyebrow="My Academic Workspace"
        userName={teacherName}
        userRole="Faculty Console"
        avatarSeed={teacherName}
        dashboardHref="/teacher"
      >
        <CycleGate>
          {children}
        </CycleGate>
      </RoleShell>
    </CycleProvider>
  );
}
