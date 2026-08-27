"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneOf, type ModuleTone } from "@/lib/ui/module-tones";

/**
 * The horizontal section strip.
 *
 * Academics grew this first: the area is ten screens deep, and every hop
 * between them meant reopening a sidebar group. Staff and Students have the
 * same shape — several screens that belong to one job — so the strip is now
 * generic and each area supplies only its list. Keeping one implementation
 * matters more than it looks: the overflow arrows, the scroll-into-view on
 * external navigation and the prev/next stepper all have to behave identically
 * or the three areas stop feeling like one product.
 */
export interface SectionNavItem {
  view: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Short grouping label; a hairline is drawn wherever it changes. */
  group: string;
  tone: ModuleTone;
}

export function SectionSubnav({
  ariaLabel,
  items: allItems,
  active,
  onNavigate,
  allowed,
}: {
  /** Names the strip for screen readers — "Academics", "Staff", "Students". */
  ariaLabel: string;
  items: SectionNavItem[];
  active: string;
  onNavigate: (view: string) => void;
  /** Views this user may open. Anything left out is hidden, not disabled. */
  allowed?: (view: string) => boolean;
}) {
  const items = allowed ? allItems.filter((i) => allowed(i.view)) : allItems;
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
      aria-label={ariaLabel}
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
                  <Icon
                    className={cn("h-3.5 w-3.5", isActive ? "text-white" : toneOf(item.tone).text)}
                  />
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

        {/* Step through the screens in order — useful during setup, when the
            next screen is genuinely the next thing to do. */}
        {index >= 0 ? (
          <div className="ml-1 hidden shrink-0 items-center gap-0.5 border-l border-[#cfc2d6]/20 pl-1.5 lg:flex">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => onNavigate(items[index - 1].view)}
              aria-label={`Previous ${ariaLabel.toLowerCase()} screen`}
              title={index > 0 ? items[index - 1].label : undefined}
              className="flex h-8 w-7 items-center justify-center rounded-lg text-ink-subtle transition-colors enabled:cursor-pointer hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={index === items.length - 1}
              onClick={() => onNavigate(items[index + 1].view)}
              aria-label={`Next ${ariaLabel.toLowerCase()} screen`}
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
