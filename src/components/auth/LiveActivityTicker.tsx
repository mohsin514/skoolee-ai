"use client";

import { ClipboardCheck } from "lucide-react";

/**
 * A static synthetic activity example. It is deliberately not presented as
 * a live event or a customer outcome.
 */
export default function LiveActivityTicker({ className = "", label = "Illustrative activity · synthetic example only" }: { className?: string; label?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`inline-flex items-center gap-2 overflow-hidden rounded-full border border-white/20 bg-brand-900/50 px-3.5 py-2 shadow-lg backdrop-blur-md ${className}`}
    >
      <span className="flex items-center gap-2">
        <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <span className="whitespace-nowrap text-2xs font-bold text-white/90">{label}</span>
      </span>
    </div>
  );
}
