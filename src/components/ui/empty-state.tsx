"use client";

/**
 * What a list, table or panel shows when it has nothing in it yet. It says
 * why it is empty and what to do next, so an empty screen reads as a
 * starting point rather than as a failure to load.
 */

import * as React from "react";
import Link from "next/link";
import { Inbox, type LucideIcon } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./button";
import type { PageAction } from "./page-header";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary next step (usually a Button). */
  action?: React.ReactNode;
  /**
   * The screen's PageHeader primary action, repeated here with the same label
   * (§4.5.7 — the only allowed duplicate). Pass the same `PageAction` object you
   * give PageHeader; it renders as the same control. Ignored when `action` is set.
   */
  primaryAction?: PageAction;
  /** A quieter alternative, such as a help link or "Clear filters". */
  secondaryAction?: React.ReactNode;
  /** `sm` for inside cards and tables; `md` for a whole panel. */
  size?: "sm" | "md";
  className?: string;
}

function RepeatedPrimary({ action }: { action: PageAction }) {
  const t = useUiText();
  const Icon = action.icon;
  const content = <>{Icon && !action.loading ? <Icon aria-hidden="true" /> : null}{t(action.label)}</>;
  if (action.href && !action.disabled) {
    return <Link href={action.href} className={buttonVariants({ variant: action.tone === "danger" ? "outline" : "default" })} onClick={action.onClick}>{content}</Link>;
  }
  return (
    <Button
      type="button"
      variant={action.tone === "danger" ? "outline" : "default"}
      loading={action.loading}
      aria-disabled={action.disabled || undefined}
      title={action.disabled && action.disabledReason ? t(action.disabledReason) : undefined}
      className={cn(action.disabled && "cursor-not-allowed opacity-60")}
      onClick={() => { if (!action.disabled) action.onClick?.(); }}
    >
      {content}
    </Button>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, primaryAction, secondaryAction, size = "md", className }: EmptyStateProps) {
  const small = size === "sm";
  const lead = action ?? (primaryAction ? <RepeatedPrimary action={primaryAction} /> : null);
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
      {lead || secondaryAction ? (
        <div className={cn("sk-rise flex flex-wrap items-center justify-center gap-2", small ? "mt-4" : "mt-6")} style={{ animationDelay: "160ms" }}>
          {lead}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
