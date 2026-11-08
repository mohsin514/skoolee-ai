"use client";

import { cn } from "@/lib/utils";

/**
 * Password rules as a list of ticks that draw in when met. The text shape is
 * "prefix + label" (the prefix is sr-only), so description regexes and
 * "Not yet met:" filters keep matching.
 *
 * With `stateLabels` instead of prefixes (accept-invite), each item shows its
 * state as a word at the inline end and is named "<label>: <state>".
 */
type ChecklistWording =
  | { metPrefix: string; unmetPrefix: string; stateLabels?: never }   // page-owned, e.g. "Met: " / "Not yet met: "
  | { stateLabels: { met: string; unmet: string }; metPrefix?: never; unmetPrefix?: never };  // e.g. "Met" / "Needed"

export type RequirementChecklistProps = {
  id: string; items: { label: string; met: boolean }[];
  columns?: "container" | "sm" | "single";    // "container" = @min-[16rem]:grid-cols-2 (register); "sm" = sm:grid-cols-2 (reset); "single" keeps one column (state words need the width)
  size?: "xs" | "sm";
  label?: string;                             // names the list
} & ChecklistWording;

export function RequirementChecklist({ id, items, metPrefix, unmetPrefix, stateLabels, columns = "container", size = "xs", label }: RequirementChecklistProps) {
  return (
    <ul
      id={id}
      aria-label={label}
      className={cn(
        "grid grid-cols-1 gap-x-3 gap-y-1.5",
        columns === "container" ? "@min-[16rem]:grid-cols-2" : columns === "sm" ? "sm:grid-cols-2" : null,
        size === "xs" ? "text-xs" : "text-sm",
      )}
    >
      {items.map((item) => {
        const state = stateLabels ? (item.met ? stateLabels.met : stateLabels.unmet) : null;
        return (
          <li
            key={item.label}
            data-met={item.met}
            aria-label={state ? `${item.label}: ${state}` : undefined}
            className={cn("flex min-w-0 items-start gap-1.5 font-medium", item.met ? "text-status-success-text" : "text-ink-muted")}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" className={cn("sk-tick", size === "sm" && "mt-0.5")}>
              <circle data-part="ring" cx="8" cy="8" r="6.75" />
              <path data-part="check" d="M5.1 8.3 7.2 10.3 11 6.2" pathLength={1} />
            </svg>
            {state ? (
              <>
                <span className="min-w-0 flex-1">{item.label}</span>
                <span className={cn("shrink-0 text-xs font-semibold", size === "sm" && "mt-0.5", !item.met && "text-ink-subtle")}>{state}</span>
              </>
            ) : (
              <span className="min-w-0">
                <span className="sr-only">{item.met ? metPrefix : unmetPrefix}</span>
                {item.label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
