"use client";

import { useRouter } from "next/navigation";
import { BarChart3, BookOpen, Calendar, CalendarCheck, CalendarDays, ClipboardList, FileText, GraduationCap, LogOut, MessageCircle, Plane, Star, Users, Zap } from "lucide-react";
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
    { icon: GraduationCap, label: "My Classes", href: "/teacher/classes" },
    { icon: CalendarCheck, label: "Attendance", href: "/teacher/attendance" },
    { icon: Star, label: "Marks & Tests", href: "/teacher/marks" },
    { icon: ClipboardList, label: "Assessments", href: "/teacher/tests" },
    { icon: Users, label: "My Students", href: "/teacher/students" },
    { icon: MessageCircle, label: "Messages", href: "/messages" },
    { icon: FileText, label: "Reports", href: "/teacher/reports" },
    { icon: Calendar, label: "Timetable", href: "/teacher/timetable" },
    { icon: CalendarDays, label: "Calendar", href: "/teacher/calendar" },
    { icon: BarChart3, label: "Insights", href: "/teacher/insights" },
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
        logoUrl={data?.logoUrl}
        dashboardHref="/teacher"
      >
        <CycleGate>
          {children}
        </CycleGate>
      </RoleShell>
    </CycleProvider>
  );
}
