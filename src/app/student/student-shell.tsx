"use client";

import { useRouter } from "next/navigation";
import { BookOpen, Calendar, CreditCard, FileText, HelpCircle, LayoutGrid, LogOut } from "lucide-react";
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
    { icon: Calendar, label: "Schedule", href: "/student/schedule" },
    { icon: FileText, label: "Report Cards", href: "/student/reports" },
    { icon: CreditCard, label: "Fee Tokens", href: "/student/fees" },
  ];
  const bottomItems: RoleNavItem[] = [
    { icon: HelpCircle, label: "Help Center", onClick: () => toast.info("Student help is available from this role workspace.") },
    { icon: LogOut, label: "Sign Out", onClick: handleLogout },
  ];

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
