"use client";

import {
  Calendar,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Clock,
  DoorOpen,
  FileText,
  History,
  LayoutDashboard,
  Scale,
  School,
} from "lucide-react";
import { SectionSubnav, type SectionNavItem } from "@/components/nav/SectionSubnav";

/**
 * The academic area is eleven screens deep. This strip keeps the whole area one
 * click away and — because it also shows where you are in the sequence — makes
 * the shape of the year visible: set up, teach, examine, report.
 *
 * The strip itself lives in `SectionSubnav`; Staff and Students use the same
 * one, so all three areas scroll, step and highlight identically.
 */
export type AcademicNavItem = SectionNavItem;

export const ACADEMIC_NAV: AcademicNavItem[] = [
  { view: "academic-hub", label: "Overview", icon: LayoutDashboard, group: "Set up", tone: "brand" },
  { view: "year-setup", label: "Set Up New Year", icon: CalendarRange, group: "Set up", tone: "brand" },
  { view: "classes", label: "Classes & Subjects", icon: School, group: "Set up", tone: "classes" },
  { view: "year-cycle", label: "Academic Years", icon: History, group: "Set up", tone: "classes" },
  { view: "timetable", label: "Class Timetable", icon: Calendar, group: "Run the year", tone: "timetable" },
  { view: "period-setup", label: "Daily Periods", icon: Clock, group: "Run the year", tone: "timetable" },
  { view: "class-rooms", label: "Rooms", icon: DoorOpen, group: "Run the year", tone: "staff" },
  { view: "school-calendar", label: "Holidays & Calendar", icon: CalendarDays, group: "Run the year", tone: "leave" },
  { view: "exam-cycles", label: "Exams & Results", icon: FileText, group: "Assess", tone: "exams" },
  { view: "grading-rules", label: "Grading Rules", icon: Scale, group: "Assess", tone: "exams" },
  { view: "report-cards", label: "Report Cards", icon: ClipboardList, group: "Assess", tone: "reports" },
];

export const ACADEMIC_VIEWS = new Set(ACADEMIC_NAV.map((i) => i.view));

/**
 * Which permission module each academic screen belongs to, so the strip hides
 * exactly what the sidebar hides. Kept beside the nav list because the two go
 * out of sync the moment they live apart.
 */
export const ACADEMIC_VIEW_MODULE: Record<string, string> = {
  "academic-hub": "timetable",
  "year-setup": "timetable",
  classes: "timetable",
  "year-cycle": "students",
  timetable: "timetable",
  "period-setup": "timetable",
  "class-rooms": "timetable",
  "school-calendar": "timetable",
  "exam-cycles": "exams",
  "grading-rules": "exams",
  "report-cards": "reports",
};

export function AcademicSubnav({
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
      ariaLabel="Academics"
      items={ACADEMIC_NAV}
      active={active}
      onNavigate={onNavigate}
      allowed={allowed}
    />
  );
}
