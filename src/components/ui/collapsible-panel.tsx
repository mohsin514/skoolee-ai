"use client";

import { useState, type ReactNode, type HTMLAttributes } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsiblePanelProps extends HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  defaultOpen?: boolean;
  /** Controlled when defined (e.g. a disclosure that must stay open while it holds an error); uncontrolled otherwise. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function CollapsiblePanel({
  icon: Icon,
  title,
  subtitle,
  headerRight,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: CollapsiblePanelProps) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : innerOpen;
  const toggle = () => {
    if (!controlled) setInnerOpen((current) => !current);
    onOpenChange?.(!open);
  };

  return (
    <div className={cn("sk-panel overflow-hidden", className)} {...props}>
      {/* A native <button> can't legally contain `headerRight`, which is
          sometimes itself a button (e.g. BrandButton) — nested interactive
          controls are invalid HTML and trigger a hydration mismatch. This
          div reproduces button semantics/keyboard behavior without that
          constraint, matching the accessible-div pattern used elsewhere
          (e.g. StatCard's onClick variant). */}
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="group flex w-full cursor-pointer flex-col gap-4 p-5 text-start transition-colors hover:bg-surface-subtle sm:flex-row sm:items-center sm:justify-between sm:p-6"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3 sm:items-center sm:justify-start">
          <div className="sk-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary ring-1 ring-brand-200/60">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-ink-strong">{title}</p>
            {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {headerRight ? <div onClick={(e) => e.stopPropagation()}>{headerRight}</div> : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-ink-subtle transition-transform duration-200 group-hover:text-primary",
              open && "rotate-180"
            )}
          />
        </div>
      </div>
      {open ? <div className="sk-fade-in border-t border-border-subtle p-5 sm:p-6">{children}</div> : null}
    </div>
  );
}
