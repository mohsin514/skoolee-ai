"use client";

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
  Star,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export const TEACHER_NAV: TeacherNavItem[] = [
  { href: "/teacher", label: "Dashboard", icon: BookOpen, group: "Teach" },
  { href: "/teacher/classes", label: "My Classes", icon: GraduationCap, group: "Teach" },
  { href: "/teacher/timetable", label: "Timetable", icon: Calendar, group: "Teach" },
  { href: "/teacher/students", label: "My Students", icon: Users, group: "Teach" },
  { href: "/teacher/attendance", label: "Attendance", icon: CalendarCheck, group: "Assess" },
  { href: "/teacher/marks", label: "Marks", icon: Star, group: "Assess" },
  { href: "/teacher/tests", label: "Assessments", icon: ClipboardList, group: "Assess" },
  { href: "/teacher/reports", label: "Reports", icon: FileText, group: "Assess" },
  { href: "/teacher/insights", label: "Insights", icon: BarChart3, group: "Me" },
  { href: "/teacher/calendar", label: "Calendar", icon: CalendarDays, group: "Me" },
  { href: "/teacher/leave", label: "Leave", icon: Plane, group: "Me" },
  { href: "/teacher/ai", label: "AI Insights", icon: Zap, group: "Me" },
];

/**
 * Horizontal navigation across the teacher's twelve screens, grouped by what
 * the teacher is doing: preparing to teach, assessing, or managing their own
 * week. The sidebar lists all twelve flat; this makes the shape visible and
 * puts every screen one click from every other.
 */
export function TeacherSubnav() {
  const pathname = usePathname();
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    setOverflow({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  };

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Keep the current screen in view when it changes from the sidebar too.
  useEffect(() => {
    scroller.current
      ?.querySelector<HTMLElement>(`[data-href="${pathname}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [pathname]);

  const nudge = (direction: -1 | 1) =>
    scroller.current?.scrollBy({ left: direction * 240, behavior: "smooth" });

  return (
    <nav
      aria-label="Teacher sections"
      className="flex items-center gap-1 border-b border-[#cfc2d6]/12 bg-white/70 px-3 py-1.5 backdrop-blur-xl"
    >
      {overflow.left ? (
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Scroll left"
          className="flex h-8 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : null}

      <div ref={scroller} className="flex flex-1 items-center gap-1 overflow-x-auto scroll-smooth custom-scrollbar">
        {TEACHER_NAV.map((item, i) => {
          const Icon = item.icon;
          // "/teacher" would otherwise light up on every child route.
          const isActive = item.href === "/teacher" ? pathname === "/teacher" : pathname.startsWith(item.href);
          const startsGroup = i > 0 && TEACHER_NAV[i - 1].group !== item.group;
          return (
            <React.Fragment key={item.href}>
              {startsGroup ? (
                <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[#cfc2d6]/30" />
              ) : null}
              <button
                type="button"
                data-href={item.href}
                onClick={() => router.push(item.href)}
                aria-current={isActive ? "page" : undefined}
                title={`${item.group} · ${item.label}`}
                className={cn(
                  "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-black uppercase tracking-wider transition-all",
                  isActive
                    ? "bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] text-white shadow-[0_4px_12px_-4px_rgba(129,39,207,0.65)]"
                    : "text-ink-muted hover:bg-[#fbf0fe] hover:text-[#8127cf]",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {overflow.right ? (
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Scroll right"
          className="flex h-8 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}
    </nav>
  );
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
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  summary?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  banner?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <section className="relative flex flex-1 flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_2px_8px_rgba(31,26,35,0.06),0_24px_60px_-24px_rgba(31,26,35,0.35)]">
      <header className="relative shrink-0 overflow-hidden border-b border-[#cfc2d6]/12 bg-white">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#8127cf] via-[#9c48ea] to-[#8127cf]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-bl from-[#8127cf]/8 to-transparent blur-2xl"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-[0_4px_12px_-2px_rgba(129,39,207,0.45)]">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="truncate text-lg font-black leading-tight tracking-tight text-[#1d1b20]">
                  {title}
                </h1>
                <span className="hidden shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-[#8127cf]/70 sm:inline">
                  {eyebrow}
                </span>
              </div>
              {summary ? (
                <p className="truncate text-[11px] font-semibold leading-tight text-ink-muted">
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
