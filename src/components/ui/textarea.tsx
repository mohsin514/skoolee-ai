// ===========================================
// shadcn/ui - Textarea Component
// ===========================================

import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[88px] w-full rounded-xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-3.5 py-2.5 text-sm font-bold text-[#1f1a23] shadow-none transition-all placeholder:text-ink-subtle hover:border-[#cfc2d6]/40 focus-visible:border-[#8127cf]/40 focus-visible:bg-white focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(129,39,207,0.08)] disabled:cursor-not-allowed disabled:opacity-50 resize-none aria-[invalid=true]:border-red-500/70 aria-[invalid=true]:bg-red-50/60 aria-[invalid=true]:text-red-950 aria-[invalid=true]:focus-visible:border-red-500 aria-[invalid=true]:focus-visible:shadow-[0_0_0_3px_rgba(239,68,68,0.12)]",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
