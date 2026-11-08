"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";

/**
 * The package's campus places as a row of cells: filled for campuses that
 * will be activated, warning-hatched for drafts beyond the package (after a
 * dashed "package line"), outlined for unused places. Long rows end in "+n";
 * an unlimited package ends in "∞". Decorative: the caller always renders
 * the text equivalent next to it (never as a live region).
 */
export type CapacityMeterProps = {
  planned: number;
  limit: number;      // -1 = unlimited
  max?: number;       // cells drawn before "+n" (default 10)
  className?: string;
};

type Cell = "active" | "draft" | "empty";

export function CapacityMeter({ planned, limit, max = 10, className }: CapacityMeterProps) {
  const unlimited = limit < 0;
  const count = Math.max(0, Math.floor(planned));
  const active = unlimited ? count : Math.min(count, limit);
  const draft = unlimited ? 0 : Math.max(0, count - limit);
  const empty = unlimited ? 0 : Math.max(0, limit - count);
  const cells: Cell[] = [
    ...Array<Cell>(active).fill("active"),
    ...Array<Cell>(draft).fill("draft"),
    ...Array<Cell>(empty).fill("empty"),
  ];
  const shown = cells.slice(0, Math.max(1, max));
  const hidden = cells.length - shown.length;
  return (
    <div aria-hidden="true" className={cn("sk-capacity", className)} data-unlimited={unlimited ? "" : undefined}>
      {shown.map((state, i) => (
        <Fragment key={i}>
          {state === "draft" && i === active ? <span data-limit="" /> : null}
          <span data-cell="" data-state={state} />
        </Fragment>
      ))}
      {unlimited ? <span className="sk-folio sk-capacity-more">∞</span> : hidden > 0 ? <span className="sk-folio sk-capacity-more">+{hidden}</span> : null}
    </div>
  );
}
