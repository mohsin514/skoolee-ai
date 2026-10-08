"use client";

import { ClipboardCheck } from "lucide-react";

/**
 * A static synthetic activity example. It is deliberately not presented as
 * a live event or a customer outcome.
 */
export default function LiveActivityTicker({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`inline-flex items-center gap-2 overflow-hidden rounded-full border border-white/20 bg-[#3d0f6b]/50 px-3.5 py-2 shadow-lg backdrop-blur-md ${className}`}
    >
      <span className="flex items-center gap-2">
        <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <span className="whitespace-nowrap text-[11px] font-bold text-white/90">Illustrative activity · synthetic example only</span>
      </span>
    </div>
  );
}
