"use client";

import { Check } from "lucide-react";

/**
 * The numbered sheet rail: the one step navigation at every width. Each step
 * is a ghost button with a numbered dot (a tick once done, "!" when it needs
 * attention) and its title; an ink rule fills toward the next step as each
 * is completed. Titles show for every step once the rail is ≥ 50rem wide,
 * otherwise only the current one. Locked steps (and every step while saving)
 * are disabled. Hover and focus mark only the dot and title (never the
 * whole column a wide rail gives each step). Accessible name: "Step 2 of 6: Institution details (completed)".
 */
export type RailState = "done" | "current" | "open" | "locked" | "attention";

export type SheetRailProps = {
  label: string;
  steps: { id: string; title: string; state: RailState }[];
  itemName(index: number, total: number, title: string): string;   // fill(t.charter.railItem, n, N, title)
  stateLabels: { done: string; current: string; locked: string; attention: string };
  disabled?: boolean;
  onSelect(id: string): void;
};

export function SheetRail({ label, steps, itemName, stateLabels, disabled, onSelect }: SheetRailProps) {
  const total = steps.length;
  return (
    <nav aria-label={label} className="sk-rail-frame @container">
      <ol data-step-rail="" className="sk-sheet-rail">
        {steps.map((step, index) => {
          const stateLabel = step.state === "open" ? null : stateLabels[step.state];
          const name = `${itemName(index + 1, total, step.title)}${stateLabel ? ` (${stateLabel})` : ""}`;
          return (
            <li key={step.id} data-state={step.state}>
              <button
                type="button"
                aria-current={step.state === "current" ? "step" : undefined}
                aria-label={name}
                disabled={disabled || step.state === "locked"}
                onClick={() => onSelect(step.id)}
                className="sk-rail-step"
              >
                <span aria-hidden="true" className="sk-rail-dot" data-numeric>
                  {step.state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : step.state === "attention" ? "!" : index + 1}
                </span>
                <span aria-hidden="true" className="sk-rail-label">{step.title}</span>
              </button>
              {index < total - 1 ? <span aria-hidden="true" className="sk-rail-ink" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
