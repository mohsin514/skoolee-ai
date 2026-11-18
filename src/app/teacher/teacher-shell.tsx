"use client";

import { RoleShell } from "@/components/role-dashboard";
import { CycleProvider, CycleGate } from "@/components/academic-year/CycleGate";
import { useTeacherData } from "./teacher-data-context";
import { TeacherCommandPalette } from "@/components/teacher/command-palette";
import { useUiText } from "@/components/locale/LocaleProvider";
import { usePathname } from "next/navigation";

// Leave is HR, not academic work: a teacher must reach My leave (and the
// "Leave approved" notification target) before the year is activated.
const CYCLE_EXEMPT_PREFIXES = ["/teacher/leave"];

// Sign-out lives in RoleHeader, which this shell renders via RoleShell — one
// button doing a full-document navigation, so Back can never re-render this
// console after sign-out.
//
// The sidebar, mobile bar, eyebrow ("Teaching") and account menu (My leave)
// all come from the navigation registry (`ROLE_NAV.teacher`). The shell used to
// flatten its own list and drop the groups; now the registry's groups
// (Assessments, My classes, More) are what the teacher sees, with module and
// duty visibility (`activityStaff`, `tripToday`, `careMember`, `accessPlans`)
// decided server-side.
export function TeacherShell({ children }: { children: React.ReactNode }) {
  const ui = useUiText();
  const { data } = useTeacherData();
  const teacherName = data?.teacherName || ui("Teacher");
  const pathname = usePathname() ?? "";
  const cycleExempt = CYCLE_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <CycleProvider>
      <RoleShell
        console="teacher"
        userName={teacherName}
        avatarSeed={teacherName}
        logoUrl={data?.logoUrl}
        dashboardHref="/teacher"
      >
        {cycleExempt ? children : <CycleGate>{children}</CycleGate>}
        {/* ⌘K from anywhere in the console. Mounted at the shell so it survives
            route changes and can reach the already-loaded class and student
            lists without a second fetch. */}
        <TeacherCommandPalette data={data} />
      </RoleShell>
    </CycleProvider>
  );
}
