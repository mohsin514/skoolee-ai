"use client";

import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { RoleShell, type RoleNavItem } from "@/components/role-dashboard";
import { CycleProvider, CycleGate } from "@/components/academic-year/CycleGate";
import { useTeacherData } from "./teacher-data-context";
import { TEACHER_NAV } from "@/components/teacher/teacher-page";
import { TeacherCommandPalette } from "@/components/teacher/command-palette";

export function TeacherShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data } = useTeacherData();
  const teacherName = data?.teacherName || "Teacher";

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  // Built from the same list the in-page subnav uses, so the two can never
  // drift apart. Messaging is not a teacher "screen", so it is appended.
  const navItems: RoleNavItem[] = [
    ...TEACHER_NAV.map((item) => ({ icon: item.icon, label: item.label, href: item.href })),
    { icon: MessageCircle, label: "Messages", href: "/messages" },
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
        {/* ⌘K from anywhere in the console. Mounted at the shell so it survives
            route changes and can reach the already-loaded class and student
            lists without a second fetch. */}
        <TeacherCommandPalette data={data} />
      </RoleShell>
    </CycleProvider>
  );
}
