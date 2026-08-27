"use client";

import { ArrowRightLeft, GraduationCap, PhoneCall, Tags } from "lucide-react";
import { SectionSubnav, type SectionNavItem } from "@/components/nav/SectionSubnav";

/**
 * The student area, on the same strip as Academics.
 *
 * Ordered the way a student actually moves through the school: an enquiry
 * arrives, they are admitted onto the roster, they get categorised for fees and
 * reporting, and at year end they are promoted or archived.
 */
export const STUDENT_NAV: SectionNavItem[] = [
  { view: "admission-queries", label: "Enquiries", icon: PhoneCall, group: "Admit", tone: "attendance" },
  { view: "students", label: "Student List", icon: GraduationCap, group: "Admit", tone: "students" },
  { view: "student-setup", label: "Categories & Groups", icon: Tags, group: "Organise", tone: "classes" },
  { view: "promote-archive", label: "Promote & Archive", icon: ArrowRightLeft, group: "Year end", tone: "exams" },
];

export const STUDENT_VIEWS = new Set(STUDENT_NAV.map((i) => i.view));

/** Permission module per screen, so the strip hides what the sidebar hides. */
export const STUDENT_VIEW_MODULE: Record<string, string> = {
  "admission-queries": "admissions",
  students: "students",
  "student-setup": "students",
  "promote-archive": "students",
};

export function StudentSubnav({
  active,
  onNavigate,
  allowed,
}: {
  active: string;
  onNavigate: (view: string) => void;
  allowed?: (view: string) => boolean;
}) {
  return (
    <SectionSubnav
      ariaLabel="Students"
      items={STUDENT_NAV}
      active={active}
      onNavigate={onNavigate}
      allowed={allowed}
    />
  );
}
