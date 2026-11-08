"use client";

/**
 * In-view tabs for a console view (SPEC §3.1), synced to `?tab=` by the caller (`useConsoleView().setTab`).
 *
 * `role="tablist"` with roving focus: ←/→ move between tabs and mirror in RTL, Home/End jump to the ends,
 * and only the selected tab is in the Tab order. Below `sm` the strip becomes a `Select`, so five or seven
 * tabs never scroll sideways on a phone. Each tab emits `data-tour="page.tab.<id>"` for the spotlight tour.
 * Tabs never nest a second level.
 */

import * as React from "react";
import { Button } from "./button";
import { Select } from "./select";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

export interface ViewTabItem { id: string; label: string; count?: number; hidden?: boolean }

export interface ViewTabsProps {
  items: ViewTabItem[];
  value: string;
  onChange: (id: string) => void;
  /** EN UI key naming the tab set ("Admissions sections"). */
  ariaLabel: string;
}

export function ViewTabs({ items, value, onChange, ariaLabel }: ViewTabsProps) {
  const t = useUiText();
  const { language } = useLocale();
  const rtl = language !== "en";
  const visible = items.filter((item) => !item.hidden);
  const listRef = React.useRef<HTMLDivElement>(null);
  const selected = visible.some((item) => item.id === value) ? value : visible[0]?.id;
  const baseId = React.useId();

  if (visible.length === 0) return null;

  const focusTab = (id: string) => listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`)?.focus();
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = visible.findIndex((item) => item.id === selected);
    let next = -1;
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";
    if (event.key === forward) next = (index + 1) % visible.length;
    else if (event.key === backward) next = (index - 1 + visible.length) % visible.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visible.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = visible[next];
    onChange(target.id);
    focusTab(target.id);
  };

  const label = (item: ViewTabItem) => t(item.label);

  return (
    <div className="min-w-0">
      <div className="sm:hidden">
        <Select aria-label={t(ariaLabel)} value={selected} onChange={(event) => onChange(event.target.value)}>
          {visible.map((item) => <option key={item.id} value={item.id}>{label(item)}{typeof item.count === "number" ? ` (${item.count})` : ""}</option>)}
        </Select>
      </div>
      <div
        ref={listRef}
        role="tablist"
        aria-label={t(ariaLabel)}
        onKeyDown={onKeyDown}
        className="hidden min-w-0 flex-wrap gap-1 rounded-2xl border border-border-subtle bg-surface-subtle p-1 sm:flex"
      >
        {visible.map((item) => {
          const active = item.id === selected;
          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              size="sm"
              role="tab"
              id={`${baseId}-${item.id}`}
              data-tab-id={item.id}
              data-tour={`page.tab.${item.id}`}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={cn(
                "min-w-0 gap-2 rounded-xl px-3",
                active ? "bg-card text-primary shadow-xs ring-1 ring-border-subtle" : "text-ink-muted",
              )}
            >
              <span className="[overflow-wrap:anywhere]">{label(item)}</span>
              {typeof item.count === "number" && item.count > 0 ? (
                <span className="grid min-w-5 place-items-center rounded-full bg-brand-100 px-1.5 text-2xs font-bold text-primary"><bdi>{item.count > 99 ? "99+" : item.count}</bdi></span>
              ) : null}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
