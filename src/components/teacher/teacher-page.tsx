"use client";

import { WorkspaceSubnav } from "@/components/nav/WorkspaceSubnav";
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  GraduationCap,
  Plane,
  Search,
  Star,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toneOf, type ModuleTone } from "@/lib/ui/module-tones";
import { openTeacherPalette } from "@/components/teacher/palette-bus";

/**
 * The shell every teacher screen sits in.
 *
 * All eleven pages used to hand-roll the same header — a decorative blur, an
 * eyebrow row, a `text-3xl` title and a description, inside `p-7 px-9` — which
 * came to roughly 150px before a single row of content, and drifted apart as
 * each page was edited on its own. One component makes them consistent and
 * gives that height back to the teacher's actual work.
 */

export interface TeacherNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "Teach" | "Assess" | "Me";
  tone: ModuleTone;
}

export const TEACHER_NAV: TeacherNavItem[] = [
  { href: "/teacher", label: "Dashboard", icon: BookOpen, group: "Teach", tone: "brand" },
  { href: "/teacher/classes", label: "My Classes", icon: GraduationCap, group: "Teach", tone: "classes" },
  { href: "/teacher/timetable", label: "Timetable", icon: Calendar, group: "Teach", tone: "timetable" },
  { href: "/teacher/students", label: "My Students", icon: Users, group: "Teach", tone: "students" },
  { href: "/teacher/attendance", label: "Attendance", icon: CalendarCheck, group: "Assess", tone: "attendance" },
  { href: "/teacher/marks", label: "Marks", icon: Star, group: "Assess", tone: "exams" },
  { href: "/teacher/tests", label: "Assessments", icon: ClipboardList, group: "Assess", tone: "exams" },
  { href: "/teacher/reports", label: "Reports", icon: FileText, group: "Assess", tone: "reports" },
  { href: "/teacher/insights", label: "Insights", icon: BarChart3, group: "Me", tone: "brand" },
  { href: "/teacher/calendar", label: "Calendar", icon: CalendarDays, group: "Me", tone: "timetable" },
  { href: "/teacher/leave", label: "Leave", icon: Plane, group: "Me", tone: "leave" },
  { href: "/teacher/ai", label: "AI Insights", icon: Zap, group: "Me", tone: "ai" },
];

/**
 * Horizontal navigation across the teacher's twelve screens, grouped by what
 * the teacher is doing: preparing to teach, assessing, or managing their own
 * week. The sidebar lists all twelve flat; this makes the shape visible and
 * puts every screen one click from every other.
 */
export function TeacherSubnav() {
  return <WorkspaceSubnav label="Teacher sections" items={TEACHER_NAV.map((item) => ({ id: item.href, label: item.label, href: item.href }))} />;
}

export function TeacherPage({
  icon: Icon,
  eyebrow,
  title,
  summary,
  actions,
  children,
  /** Rendered flush under the header, outside the scroll area. */
  banner,
  contentClassName,
  tone = "brand",
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  summary?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  banner?: ReactNode;
  contentClassName?: string;
  /** The domain this screen belongs to — drives its accent colour. */
  tone?: ModuleTone;
}) {
  const t = toneOf(tone);
  return (
    <section className="relative flex flex-1 flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_2px_8px_rgba(31,26,35,0.06),0_24px_60px_-24px_rgba(31,26,35,0.35)]">
      <header className="relative shrink-0 overflow-hidden border-b border-[#cfc2d6]/12 bg-white">
        <span
          aria-hidden
          className={cn("absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r", t.rail)}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full blur-2xl"
          style={{ background: `radial-gradient(circle, ${t.hex}14, transparent 70%)` }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", t.tile)}
                style={{ boxShadow: `0 4px 12px -2px ${t.hex}73` }}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="break-words text-lg font-black leading-tight tracking-tight text-[#1d1b20]">
                  {title}
                </h1>
                <span className={cn("hidden shrink-0 text-[9px] font-black uppercase tracking-[0.12em] opacity-80 sm:inline", t.text)}>
                  {eyebrow}
                </span>
              </div>
              {summary ? (
                <p className="break-words text-sm font-semibold leading-tight text-ink-muted">
                  {summary}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>

      <TeacherSubnav />
      {banner}

      <div
        className={cn(
          "custom-scrollbar flex-1 overflow-y-auto bg-[#fbf0fe]/20 p-4 sm:p-5",
          contentClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
