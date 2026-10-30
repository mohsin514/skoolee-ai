"use client";

import { forwardRef } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The step's error summary, inside the step card under the intro: an alert
 * that takes focus (tabIndex -1, labelled by its title) and lists every
 * problem as a ghost button that jumps to the field (or the step) that owns
 * it. Same contract and text as the wizard's original summary.
 */
export type ErrorSummaryProps = { title: string; items: { key: string; label: string; onSelect(): void }[] };

export const ErrorSummary = forwardRef<HTMLDivElement, ErrorSummaryProps>(function ErrorSummary({ title, items }, ref) {
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="error-summary-title" className="sk-error-summary sk-enter">
      <p id="error-summary-title" className="flex items-center gap-2 text-sm font-semibold">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        {title}
      </p>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.key}>
            <Button variant="ghost" type="button" onClick={item.onSelect} className="-mx-2 min-h-10 justify-start px-2 text-start text-sm font-medium text-status-error-text underline underline-offset-2">
              {item.label}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
});
