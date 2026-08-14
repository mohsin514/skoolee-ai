"use client";

import { useRouter } from "next/navigation";
import { BookOpen, Calendar, CalendarCheck, Clock, CreditCard, FileText, HelpCircle, LayoutGrid, LogOut } from "lucide-react";
import { toast } from "sonner";
import { RoleShell, type RoleNavItem } from "@/components/role-dashboard";
import { useStudentData } from "./student-data-context";

export function StudentShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data } = useStudentData();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  // "Schedule" used to sit here as a second attendance page. Its unique
  // content (class teacher, enrolled subjects) now lives on Coursework, so the
  // nav has one entry per destination.
  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "Dashboard", href: "/student" },
    { icon: BookOpen, label: "Coursework", href: "/student/coursework" },
    { icon: CalendarCheck, label: "Attendance", href: "/student/attendance" },
    { icon: Clock, label: "Timetable", href: "/student/timetable" },
    { icon: FileText, label: "Report Cards", href: "/student/reports" },
    { icon: CreditCard, label: "Fees", href: "/student/fees" },
  ];
  const bottomItems: RoleNavItem[] = [];

  const student = data?.user;

  return (
    <RoleShell
      navItems={navItems}
      bottomItems={bottomItems}
      eyebrow="Official Academic Transcript"
      userName={student?.fullName || "Student"}
      userRole={student?.className || "Student Console"}
      avatarSeed={student?.fullName || "Student"}
      logoUrl={data?.logoUrl}
      dashboardHref="/student"
    >
      {children}
    </RoleShell>
  );
}
