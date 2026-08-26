"use client";

import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { RoleShell, type RoleNavItem } from "@/components/role-dashboard";
import { useStudentData } from "./student-data-context";
import { STUDENT_NAV } from "@/components/student/student-page";

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
  //
  // Built from the same list the in-page subnav uses, so the two cannot drift.
  const navItems: RoleNavItem[] = [
    ...STUDENT_NAV.map((item) => ({ icon: item.icon, label: item.label, href: item.href })),
    { icon: MessageCircle, label: "Messages", href: "/messages" },
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
