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
  children: ReactNode;
}

export function CollapsiblePanel({
  icon: Icon,
  title,
  subtitle,
  headerRight,
  defaultOpen = true,
  className,
  children,
  ...props
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-[32px] border border-[#cfc2d6]/10 bg-white shadow-lg", className)} {...props}>
      {/* A native <button> can't legally contain `headerRight`, which is
          sometimes itself a button (e.g. BrandButton) — nested interactive
          controls are invalid HTML and trigger a hydration mismatch. This
          div reproduces button semantics/keyboard behavior without that
          constraint, matching the accessible-div pattern used elsewhere
          (e.g. StatCard's onClick variant). */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((current) => !current);
          }
        }}
        className="flex w-full cursor-pointer flex-col gap-4 p-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]/30 focus-visible:ring-offset-1 sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3 sm:items-center sm:justify-start">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-black text-[#1f1a23]">{title}</p>
            {subtitle ? <p className="text-[10px] text-ink-muted">{subtitle}</p> : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {headerRight ? <div onClick={(e) => e.stopPropagation()}>{headerRight}</div> : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[#8127cf] transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </div>
      </div>
      {open ? <div className="border-t border-[#cfc2d6]/10 p-6">{children}</div> : null}
    </div>
  );
}
