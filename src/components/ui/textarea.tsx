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
        "flex min-h-[88px] w-full rounded-xl border border-transparent bg-[#f3f4f9] px-3 py-2 text-sm font-semibold text-[#1f1a23] shadow-none transition-all placeholder:text-[#4d4354]/35 focus-visible:border-[#8127cf]/25 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]/15 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
