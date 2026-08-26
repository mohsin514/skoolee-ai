"use client";

import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The shell every student screen sits in.
 *
 * All six pages hand-rolled the same header — a decorative blur, an eyebrow
 * row, a `text-3xl` title and a subtitle inside `p-7 px-9` — which measured
 * about 140px before any content, on top of a `space-y-8` (32px) rhythm. One
 * component makes them consistent and hands that height back to the student's
 * actual marks, attendance and fees.
 */

export interface StudentNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const STUDENT_NAV: StudentNavItem[] = [
  { href: "/student", label: "Dashboard", icon: LayoutGrid },
  { href: "/student/coursework", label: "Coursework", icon: BookOpen },
  { href: "/student/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/student/timetable", label: "Timetable", icon: Clock },
  { href: "/student/reports", label: "Report Cards", icon: FileText },
  { href: "/student/fees", label: "Fees", icon: CreditCard },
];

/** Horizontal navigation across the student's six screens. */
export function StudentSubnav() {
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

  useEffect(() => {
    scroller.current
      ?.querySelector<HTMLElement>(`[data-href="${pathname}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [pathname]);

  const nudge = (direction: -1 | 1) =>
    scroller.current?.scrollBy({ left: direction * 220, behavior: "smooth" });

  return (
    <nav
      aria-label="Student sections"
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
        {STUDENT_NAV.map((item) => {
          const Icon = item.icon;
          // "/student" would otherwise light up on every child route.
          const isActive = item.href === "/student" ? pathname === "/student" : pathname.startsWith(item.href);
          return (
            <button
              key={item.href}
              type="button"
              data-href={item.href}
              onClick={() => router.push(item.href)}
              aria-current={isActive ? "page" : undefined}
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

export function StudentPage({
  icon: Icon,
  avatar,
  eyebrow,
  title,
  summary,
  actions,
  children,
  banner,
  contentClassName,
}: {
  icon: LucideIcon;
  /** Shown instead of the icon tile — the dashboard uses the student's photo,
   *  which is the one screen where identity is the point. */
  avatar?: ReactNode;
  /** Usually a live figure — "92% overall · 128 days recorded". */
  eyebrow: ReactNode;
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
            {avatar ? (
              <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border-2 border-[#fbf0fe] bg-[#fbf0fe] shadow-[0_4px_12px_-2px_rgba(129,39,207,0.3)]">
                {avatar}
              </span>
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-[0_4px_12px_-2px_rgba(129,39,207,0.45)]">
                <Icon className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="truncate text-lg font-black leading-tight tracking-tight text-[#1d1b20]">
                  {title}
                </h1>
                {/* The old eyebrow carried the page's live number — "92%
                    overall", "Rs 12,000 outstanding". Too useful to drop, so it
                    rides beside the title instead of above it. */}
                <span className="hidden shrink-0 truncate text-[9px] font-black uppercase tracking-[0.12em] text-[#8127cf]/70 sm:inline">
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

      <StudentSubnav />
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
