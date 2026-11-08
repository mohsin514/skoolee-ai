"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * A titled group of fields: a small brand icon tile and a heading that names
 * the group for assistive tech. Lifted verbatim from register step 2 and
 * shared with the setup wizard.
 *
 * - `level` picks the heading tag (default h3; the setup step card uses h2,
 *   under its single h1).
 * - `asGroup={false}` drops role="group" / aria-labelledby and keeps the
 *   heading, for a section whose control already names itself by the heading
 *   id (the working-week ribbon).
 *
 * Rule: no group title may contain "Campus ID" — Playwright's
 * getByRole("group", { name: "Campus ID" }) is a substring match.
 */
export type FieldGroupProps = {
  /** Explicit, language-independent heading id (a title-derived id collapses for Arabic/Urdu). */
  id: string;
  icon: LucideIcon;
  title: string;
  level?: 2 | 3;      // default 3
  asGroup?: boolean;  // default true
  className?: string;
  children: ReactNode;
};

export function FieldGroup({ id: headingId, icon: Icon, title, level = 3, asGroup = true, className, children }: FieldGroupProps) {
  const Heading = level === 2 ? "h2" : "h3";
  // The heading is only a visual cue unless it names the group, and side-by-side
  // columns are exactly where a screen reader loses the thread.
  return (
    <section role={asGroup ? "group" : undefined} aria-labelledby={asGroup ? headingId : undefined} className={`@container space-y-4 ${className ?? ""}`}>
      <div className="flex items-center gap-2 px-1">
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-lg bg-brand-50 text-primary ring-1 ring-brand-100">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <Heading id={headingId} className="min-w-0 text-sm font-bold text-ink-strong">{title}</Heading>
      </div>
      {children}
    </section>
  );
}
