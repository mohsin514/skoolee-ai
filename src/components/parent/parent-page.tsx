"use client";

import React, { type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarCheck,
  Clock,
  CreditCard,
  FileText,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toneOf, type ModuleTone } from "@/lib/ui/module-tones";
import { useParentData } from "@/app/parent/parent-data-context";

/**
 * The shell every guardian screen sits in.
 *
 * The five parent pages each hand-rolled the same ~140px header. This makes
 * them consistent and gives the height back to the child's marks, attendance
 * and fees — which is all a guardian opened the portal to see.
 */

export interface ParentNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: ModuleTone;
}

export const PARENT_NAV: ParentNavItem[] = [
  { href: "/parent", label: "Overview", icon: LayoutGrid, tone: "brand" },
  { href: "/parent/results", label: "Results", icon: FileText, tone: "reports" },
  { href: "/parent/attendance", label: "Attendance", icon: CalendarCheck, tone: "attendance" },
  { href: "/parent/timetable", label: "Timetable", icon: Clock, tone: "timetable" },
  { href: "/parent/fees", label: "Fees", icon: CreditCard, tone: "fees" },
];

/**
 * Horizontal navigation across the guardian's five screens.
 *
 * Every link has to carry the portal token: a guardian on a token URL has no
 * session, so a bare href would bounce them to the login screen.
 */
export function ParentSubnav() {
  const pathname = usePathname();
  const router = useRouter();
  const { token } = useParentData();
  const q = token ? `?token=${encodeURIComponent(token)}` : "";

  return (
    <nav
      aria-label="Guardian sections"
      className="flex items-center gap-1 overflow-x-auto border-b border-[#cfc2d6]/12 bg-white/70 px-3 py-1.5 backdrop-blur-xl custom-scrollbar"
    >
      {PARENT_NAV.map((item) => {
        const Icon = item.icon;
        // "/parent" would otherwise light up on every child route.
        const isActive = item.href === "/parent" ? pathname === "/parent" : pathname.startsWith(item.href);
        return (
          <button
            key={item.href}
            type="button"
            onClick={() => router.push(`${item.href}${q}`)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-black uppercase tracking-wider transition-all",
              isActive
                ? "bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] text-white shadow-[0_4px_12px_-4px_rgba(129,39,207,0.65)]"
                : "text-ink-muted hover:bg-[#fbf0fe] hover:text-[#8127cf]",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", isActive ? "text-white" : toneOf(item.tone).text)} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export function ParentPage({
  icon: Icon,
  avatar,
  eyebrow,
  title,
  summary,
  actions,
  children,
  banner,
  contentClassName,
  tone = "brand",
}: {
  icon: LucideIcon;
  avatar?: ReactNode;
  /** Usually the page's live figure — "92% overall · 128 days recorded". */
  eyebrow: ReactNode;
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
            {avatar ? (
              <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border-2 border-[#fbf0fe] bg-[#fbf0fe] shadow-[0_4px_12px_-2px_rgba(129,39,207,0.3)]">
                {avatar}
              </span>
            ) : (
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", t.tile)}
                style={{ boxShadow: `0 4px 12px -2px ${t.hex}73` }}>
                <Icon className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="truncate text-lg font-black leading-tight tracking-tight text-[#1d1b20]">
                  {title}
                </h1>
                <span className={cn("hidden shrink-0 truncate text-[9px] font-black uppercase tracking-[0.12em] opacity-80 sm:inline", t.text)}>
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

      <ParentSubnav />
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
