"use client";

import { RoleShell } from "@/components/role-dashboard";
import { useStudentData } from "./student-data-context";
import { useUiText } from "@/components/locale/LocaleProvider";

// Sign-out lives in RoleHeader (see the note in teacher-shell.tsx).
//
// Navigation is the registry's learner console (`ROLE_NAV.student`): Today ·
// Work · Timetable · Results on the mobile bar, Messages, and everything else
// under More. "Schedule" stays a redirect to Attendance for old links.
export function StudentShell({ children }: { children: React.ReactNode }) {
  const ui = useUiText();
  const { data } = useStudentData();
  const student = data?.user;
  const name = student?.fullName || ui("Student");

  return (
    <RoleShell
      console="student"
      mobileDocumentFlow
      userName={name}
      avatarSeed={student?.fullName || "Student"}
      logoUrl={data?.logoUrl}
      dashboardHref="/student"
    >
      {children}
    </RoleShell>
  );
}
