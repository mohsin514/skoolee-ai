"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  DoorOpen,
  FileText,
  History,
  LayoutDashboard,
  School,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The academic area is ten screens deep, and every hop between them used to
 * mean reopening the sidebar group. This strip keeps the whole area one click
 * away and — because it also shows where you are in the sequence — makes the
 * shape of the year visible: set up, teach, examine, report.
 */
export interface AcademicNavItem {
  view: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Short grouping label shown above the strip. */
  group: "Set up" | "Run the year" | "Assess";
}

export const ACADEMIC_NAV: AcademicNavItem[] = [
  { view: "academic-hub", label: "Overview", icon: LayoutDashboard, group: "Set up" },
  { view: "year-setup", label: "Set Up New Year", icon: CalendarRange, group: "Set up" },
  { view: "classes", label: "Classes & Subjects", icon: School, group: "Set up" },
  { view: "year-cycle", label: "Academic Years", icon: History, group: "Set up" },
  { view: "timetable", label: "Class Timetable", icon: Calendar, group: "Run the year" },
  { view: "period-setup", label: "Daily Periods", icon: Clock, group: "Run the year" },
  { view: "class-rooms", label: "Rooms", icon: DoorOpen, group: "Run the year" },
  { view: "school-calendar", label: "Holidays & Calendar", icon: CalendarDays, group: "Run the year" },
  { view: "exam-cycles", label: "Exams & Results", icon: FileText, group: "Assess" },
  { view: "report-cards", label: "Report Cards", icon: ClipboardList, group: "Assess" },
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
  "report-cards": "reports",
};

export function AcademicSubnav({
  active,
  onNavigate,
  allowed,
}: {
  active: string;
  onNavigate: (view: string) => void;
  /** Views this user may open. Anything left out is hidden, not disabled. */
  allowed?: (view: string) => boolean;
}) {
  const items = allowed ? ACADEMIC_NAV.filter((i) => allowed(i.view)) : ACADEMIC_NAV;
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
  }, [items.length]);

  // Keep the current screen visible when it changes from the sidebar or a
  // card on the overview, not just from a click in here.
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-view="${active}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);

  const nudge = (direction: -1 | 1) => {
    scroller.current?.scrollBy({ left: direction * 240, behavior: "smooth" });
  };

  const index = items.findIndex((i) => i.view === active);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Academics"
      className="relative mb-3 rounded-[18px] border border-[#cfc2d6]/20 bg-white/85 p-1.5 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_8px_24px_-16px_rgba(31,26,35,0.35)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-1">
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

        <div
          ref={scroller}
          className="flex flex-1 items-center gap-1 overflow-x-auto scroll-smooth custom-scrollbar"
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            const isActive = item.view === active;
            const startsGroup = i > 0 && items[i - 1].group !== item.group;
            return (
              <React.Fragment key={item.view}>
                {startsGroup ? (
                  <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[#cfc2d6]/30" />
                ) : null}
                <button
                  type="button"
                  data-view={item.view}
                  onClick={() => onNavigate(item.view)}
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

        {/* Step through the academic screens in order — useful during setup,
            when the next screen is genuinely the next thing to do. */}
        {index >= 0 ? (
          <div className="ml-1 hidden shrink-0 items-center gap-0.5 border-l border-[#cfc2d6]/20 pl-1.5 lg:flex">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => onNavigate(items[index - 1].view)}
              aria-label="Previous academic screen"
              title={index > 0 ? items[index - 1].label : undefined}
              className="flex h-8 w-7 items-center justify-center rounded-lg text-ink-subtle transition-colors enabled:cursor-pointer hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={index === items.length - 1}
              onClick={() => onNavigate(items[index + 1].view)}
              aria-label="Next academic screen"
              title={index < items.length - 1 ? items[index + 1].label : undefined}
              className="flex h-8 w-7 items-center justify-center rounded-lg text-ink-subtle transition-colors enabled:cursor-pointer hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
