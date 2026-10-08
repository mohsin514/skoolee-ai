"use client";

import { pageCardSurface } from "@/components/ui/page-card";

import { WorkspaceSubnav } from "@/components/nav/WorkspaceSubnav";
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneOf, type ModuleTone } from "@/lib/ui/module-tones";
import { SkeletonBar as SkeletonBlock } from "@/components/ui/skeleton";

/**
 * The shell the operations consoles sit in.
 *
 * Accountant, Librarian and Receptionist were the three roles the console
 * redesign never reached. Each was a single route switching an `activeView`
 * inside a bare `<section>`: no page header, no section strip, a "Welcome,
 * {name}" hero repeated verbatim in all three, and a naked spinner for every
 * load. Meanwhile the teacher, student and guardian consoles had all moved to
 * a compact header with a domain-tinted rail and a strip of tabs.
 *
 * These are the same primitives, driven by `activeView` rather than by the
 * router — which is the only real difference between those consoles and
 * these.
 */

export interface ConsoleNavItem<T extends string = string> {
  id: T;
  label: string;
  icon: LucideIcon;
  tone: ModuleTone;
  /** Optional grouping — a hairline is drawn where the group changes. */
  group?: string;
  /** Shown in the page header when this view is active. */
  eyebrow?: string;
  /** Shown under the title when this view is active. */
  summary?: string;
}

/**
 * Horizontal navigation across a console's views.
 *
 * The sidebar already lists them, but on a single-route console the sidebar
 * is the *only* way between views — collapse it and the console loses its
 * navigation entirely. This puts every view one click from every other, and
 * keeps the active one scrolled into sight.
 */
export function ConsoleSubnav<T extends string>({
  items,
  activeId,
  onSelect,
  label = "Console sections",
}: {
  items: ConsoleNavItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  label?: string;
}) {
  return <WorkspaceSubnav label={label} items={items} active={activeId} onSelect={(id) => onSelect(id as T)} />;
}


export function ConsolePage<T extends string>({
  items,
  activeId,
  onSelect,
  navLabel,
  icon: Icon,
  eyebrow,
  title,
  summary,
  actions,
  banner,
  children,
  contentClassName,
  tone = "brand",
}: {
  items: ConsoleNavItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  navLabel?: string;
  icon: LucideIcon;
  eyebrow: ReactNode;
  title: string;
  summary?: ReactNode;
  actions?: ReactNode;
  /** Rendered flush under the header, outside the scroll area. */
  banner?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  /** The domain this view belongs to — drives its accent colour. */
  tone?: ModuleTone;
}) {
  const t = toneOf(tone);
  return (
    <section className={cn(pageCardSurface, "p-0 sm:p-0", "relative flex flex-1 flex-col overflow-hidden")} >
      <header className="relative shrink-0 overflow-hidden border-b border-[#cfc2d6]/12 bg-white">
        <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r", t.rail)} />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full blur-2xl"
          style={{ background: `radial-gradient(circle, ${t.hex}14, transparent 70%)` }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", t.tile)}
              style={{ boxShadow: `0 4px 12px -2px ${t.hex}73` }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="break-words text-lg font-black leading-tight tracking-tight text-[#1d1b20]">
                  {title}
                </h1>
                <span
                  className={cn(
                    "hidden shrink-0 truncate text-[9px] font-black uppercase tracking-[0.12em] opacity-80 sm:inline",
                    t.text,
                  )}
                >
                  {eyebrow}
                </span>
              </div>
              {summary ? (
                <p className="break-words text-sm font-semibold leading-tight text-ink-muted">{summary}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>

      <ConsoleSubnav items={items} activeId={activeId} onSelect={onSelect} label={navLabel} />
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


/**
 * What these consoles show while their session loads.
 *
 * All three used to render a naked spinner on a full-bleed lilac background —
 * not the page, not even the sidebar, so the whole console flashed away and
 * rebuilt itself. This mirrors `ConsolePage` so the only thing that changes
 * when the data lands is the content.
 */
export function ConsoleSkeleton({ cards = 4, label = "Loading the console" }: { cards?: number; label?: string }) {
  return (
    <section
      /* Announced once, at the frame, so a screen reader says "loading"
         rather than reading a page of empty placeholders. */
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn(pageCardSurface, "p-0 sm:p-0", "relative flex flex-1 flex-col overflow-hidden")}
    >
      <header className="relative shrink-0 overflow-hidden border-b border-[#cfc2d6]/12 bg-white">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#8127cf] to-[#9c48ea] opacity-30"
        />
        <div className="relative flex items-center gap-3 px-4 py-3 sm:px-5">
          <SkeletonBlock className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="min-w-0 space-y-1.5">
            <SkeletonBlock className="h-4 w-44" />
            <SkeletonBlock className="h-2.5 w-60" />
          </div>
        </div>
      </header>

      {/* The strip's shape is known before the session is: it is a static
          list, so drawing it here keeps the header from shifting. */}
      <div className="flex items-center gap-1 border-b border-[#cfc2d6]/12 bg-white/70 px-3 py-1.5">
        {[...Array(6)].map((_, i) => (
          <SkeletonBlock key={i} className="h-8 w-24 shrink-0 rounded-lg" />
        ))}
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto bg-[#fbf0fe]/20 p-4 sm:p-5">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(cards)].map((_, i) => (
              <div
                key={i}
                className="rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]"
              >
                <SkeletonBlock className="mb-3 h-9 w-9 rounded-xl" />
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="mt-1.5 h-2.5 w-32" />
              </div>
            ))}
          </div>
          <div className="rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
            <div className="mb-3 flex items-center gap-2.5">
              <SkeletonBlock className="h-8 w-8 shrink-0 rounded-xl" />
              <SkeletonBlock className="h-4 w-40" />
            </div>
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <SkeletonBlock key={i} className="h-12 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * A dashboard entry point.
 *
 * The old tiles were a gradient chip over a label and the words "View &
 * manage" — four cards that said the same thing the sidebar already said,
 * with no indication of what waited behind them. These carry the view's own
 * domain colour and a real description.
 */
export function ConsoleQuickLink({
  icon: Icon,
  label,
  description,
  tone = "brand",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  tone?: ModuleTone;
  onClick: () => void;
}) {
  const t = toneOf(tone);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 text-left shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8127cf]/30 hover:shadow-[0_2px_4px_rgba(31,26,35,0.05),0_14px_28px_-14px_rgba(129,39,207,0.4)]"
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-[3px] opacity-0 transition-opacity group-hover:opacity-60 bg-gradient-to-b", t.tile)}
      />
      <span
        className={cn(
          "mb-3 flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105",
          t.chip,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-sm font-black tracking-tight text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">
        {label}
      </p>
      <p className="mt-1 text-[11px] font-semibold leading-snug text-ink-muted">{description}</p>
    </button>
  );
}
