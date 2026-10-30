"use client";

import { type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  Plane,
  Star,
  Users,
  Zap,
  type LucideIcon,
  FolderOpen,
  Target,
  ClipboardCheck,
  Accessibility,
  Sparkles,
  Trophy,
} from "lucide-react";
import { PageHeader, type PageAction } from "@/components/ui/page-header";
import { PAGE_CARD_BODY, PageHeaderSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";
import { cn } from "@/lib/utils";
import type { ModuleTone } from "@/lib/ui/module-tones";

/**
 * The page every teacher screen sits in: one shared `PageHeader` (SPEC §4.3, R1) inside the shell's one
 * page card (RoleShell draws it; pages never draw their own). The title is the registry label, the description is one sentence, there is at most one
 * primary action, and in-page section strips are gone — the sidebar (registry `teacher`) is the only
 * navigation, so a teacher never sees the same destinations twice.
 */

export interface TeacherNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "Teach" | "Assess" | "Me";
  tone: ModuleTone;
}

/**
 * @deprecated The teacher sidebar comes from the navigation registry (`ROLE_NAV.teacher`,
 * `src/lib/navigation/role-nav.ts`). Kept for one release for fixtures that still pass explicit nav items.
 */
export const TEACHER_NAV: TeacherNavItem[] = [
  { href: "/teacher", label: "Today", icon: BookOpen, group: "Teach", tone: "brand" },
  { href: "/teacher/classes", label: "Classes", icon: GraduationCap, group: "Teach", tone: "classes" },
  { href: "/teacher/timetable", label: "Timetable & cover", icon: Calendar, group: "Teach", tone: "timetable" },
  { href: "/teacher/resources", label: "Resources", icon: FolderOpen, group: "Teach", tone: "classes" },
  { href: "/teacher/assignments", label: "Homework", icon: ClipboardCheck, group: "Assess", tone: "exams" },
  { href: "/teacher/students", label: "Students", icon: Users, group: "Teach", tone: "students" },
  { href: "/teacher/portfolio", label: "Portfolios", icon: Sparkles, group: "Teach", tone: "students" },
  { href: "/activities", label: "Activities", icon: Trophy, group: "Teach", tone: "students" },
  { href: "/teacher/attendance", label: "Attendance", icon: CalendarCheck, group: "Assess", tone: "attendance" },
  { href: "/teacher/marks", label: "Marks", icon: Star, group: "Assess", tone: "exams" },
  { href: "/teacher/curriculum", label: "Objective map", icon: Target, group: "Assess", tone: "exams" },
  { href: "/teacher/accommodations", label: "Access plans", icon: Accessibility, group: "Assess", tone: "exams" },
  { href: "/teacher/tests", label: "Tests & quizzes", icon: ClipboardList, group: "Assess", tone: "exams" },
  { href: "/teacher/reports", label: "Report cards", icon: FileText, group: "Assess", tone: "reports" },
  { href: "/teacher/insights", label: "My teaching evidence", icon: BarChart3, group: "Me", tone: "brand" },
  { href: "/teacher/calendar", label: "Calendar & meetings", icon: CalendarDays, group: "Me", tone: "timetable" },
  { href: "/teacher/leave", label: "My leave", icon: Plane, group: "Me", tone: "leave" },
  { href: "/teacher/ai", label: "AI assistant", icon: Zap, group: "Me", tone: "ai" },
];

export interface WorkspacePageProps {
  /** Registry label verbatim (EN UI key; PageHeader translates it). */
  title: string;
  /**
   * One sentence; names the decider where relevant. A string is an EN UI key; data (names, classes,
   * campuses) goes in as a node with `<bdi>` around each value so it is never looked up as a key (R7).
   */
  description?: ReactNode;
  icon?: LucideIcon;
  /** Persistent state: chips and Alerts ("Checked in 08:02", "Read only"). */
  status?: ReactNode;
  primaryAction?: PageAction;
  secondaryActions?: PageAction[];
  /** A `ViewTabs` element for in-view sections. */
  tabs?: ReactNode;
  children: ReactNode;
  /** Rendered between the header and the content. */
  banner?: ReactNode;
  contentClassName?: string;
}

/**
 * The scroll area a console page draws inside the shell's one page card (addendum 2026-10-22 §2). RoleShell
 * draws the card itself (`PAGE_CARD_CLASS`, no padding); the page supplies the shared body padding
 * (`PAGE_CARD_BODY`, the same as framed routes) and its own scrolling, and never a second card or surface.
 * `documentFlow` (family and learner consoles) lets the page join the document scroll below `md`.
 */
export function workspacePageClass(documentFlow = false) {
  return cn(
    "custom-scrollbar relative flex min-w-0 flex-col gap-6",
    documentFlow ? "flex-none overflow-visible md:min-h-0 md:flex-1 md:overflow-y-auto" : "min-h-0 flex-1 overflow-y-auto",
    PAGE_CARD_BODY,
  );
}

/** The page body every teacher, family and learner screen shares: PageHeader, an optional banner, the content. */
export function WorkspacePage({ documentFlow = false, title, description, icon, status, primaryAction, secondaryActions, tabs, children, banner, contentClassName }: WorkspacePageProps & { documentFlow?: boolean }) {
  return (
    <section data-workspace-page className={workspacePageClass(documentFlow)}>
      <PageHeader
        title={title}
        description={description}
        icon={icon}
        status={status}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        tabs={tabs}
      />
      {banner}
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </section>
  );
}

/**
 * The loading shape of `WorkspacePage`: the same padding and gap, a PageHeader placeholder and the page's own
 * content placeholder — so nothing moves when the data lands (addendum 2026-10-22 §3). Announced once.
 */
export function WorkspacePageSkeleton({ label, documentFlow = false, action = false, tabs = false, children }: { label: string; documentFlow?: boolean; action?: boolean; tabs?: boolean; children: ReactNode }) {
  return (
    <section role="status" aria-busy="true" aria-label={label} className={workspacePageClass(documentFlow)}>
      <PageHeaderSkeleton action={action} tabs={tabs} />
      <div className="min-w-0">{children}</div>
      <span className="sr-only">{label}…</span>
    </section>
  );
}

export function TeacherPage(props: WorkspacePageProps) {
  return <WorkspacePage {...props} />;
}
