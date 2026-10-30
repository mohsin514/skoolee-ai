"use client";

import { RoleShell } from "@/components/role-dashboard";
import { CycleProvider, CycleGate } from "@/components/academic-year/CycleGate";
import { useTeacherData } from "./teacher-data-context";
import { TeacherCommandPalette } from "@/components/teacher/command-palette";
import { useUiText } from "@/components/locale/LocaleProvider";

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

  return (
    <CycleProvider>
      <RoleShell
        console="teacher"
        userName={teacherName}
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
