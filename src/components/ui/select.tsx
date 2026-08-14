// ===========================================
// shadcn/ui - Select Component
// ===========================================

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  return (
    <select
      className={cn(
        "flex h-12 w-full cursor-pointer rounded-xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-3.5 py-2 text-sm font-bold text-[#1f1a23] shadow-none transition-all hover:border-[#cfc2d6]/40 focus-visible:border-[#8127cf]/40 focus-visible:bg-white focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(129,39,207,0.08)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  );
});
Select.displayName = "Select";

export { Select };
