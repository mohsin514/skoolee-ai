"use client";

/**
 * What a list, table or panel shows when it has nothing in it yet. It says
 * why it is empty and what to do next, so an empty screen reads as a
 * starting point rather than as a failure to load.
 */

import * as React from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary next step (usually a Button). */
  action?: React.ReactNode;
  /** A quieter alternative, such as a help link or "Clear filters". */
  secondaryAction?: React.ReactNode;
  /** `sm` for inside cards and tables; `md` for a whole panel. */
  size?: "sm" | "md";
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, secondaryAction, size = "md", className }: EmptyStateProps) {
  const small = size === "sm";
  return (
    <div className={cn("relative isolate flex flex-col items-center justify-center overflow-hidden text-center", small ? "px-4 py-8" : "px-6 py-14 sm:py-16", className)}>
      <div aria-hidden="true" className="sk-grid-pattern pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-48 max-w-md" />
      <div className="sk-rise relative">
        <span aria-hidden="true" className={cn("absolute inset-0 -z-10 rounded-full bg-primary/15 blur-2xl", small ? "scale-125" : "scale-150")} />
        <div className={cn(
          "sk-gradient-border grid place-items-center text-primary shadow-md",
          small ? "mb-3 size-12 rounded-2xl" : "mb-5 size-16 rounded-[22px]",
        )}>
          <Icon aria-hidden="true" className={small ? "size-6" : "size-7"} strokeWidth={1.9} />
        </div>
      </div>
      <h3 className={cn("sk-rise font-bold text-ink-strong", small ? "text-sm" : "text-lg")} style={{ animationDelay: "60ms" }}>{title}</h3>
      {description ? (
        <p className={cn("sk-rise mt-1.5 max-w-sm leading-relaxed text-ink-muted", small ? "text-xs" : "text-sm")} style={{ animationDelay: "110ms" }}>
          {description}
        </p>
      ) : null}
      {action || secondaryAction ? (
        <div className={cn("sk-rise flex flex-wrap items-center justify-center gap-2", small ? "mt-4" : "mt-6")} style={{ animationDelay: "160ms" }}>
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
