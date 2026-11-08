"use client";

import { ChevronRight } from "lucide-react";

/** A forward chevron that leans ahead on hover and points the reading direction in RTL. */
export function ForwardArrow({ className = "w-4 h-4" }: { className?: string }) {
  // The nudge (transform) sits on the wrapper so it never composes with the RTL rotation.
  return (
    <span aria-hidden="true" className="sk-nudge inline-flex shrink-0">
      <ChevronRight className={`${className} rtl:rotate-180`} />
    </span>
  );
}
