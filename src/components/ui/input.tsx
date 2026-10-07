// ===========================================
// shadcn/ui - Input Component
// ===========================================

import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex min-h-12 w-full rounded-2xl border border-[#d8cfe5] bg-[#fcfaff] px-4 py-2.5 text-base font-semibold text-foreground shadow-[0_2px_3px_-2px_rgba(55,27,77,0.12),inset_0_1px_0_white,inset_0_-10px_18px_-16px_rgba(129,39,207,0.12)] transition-[background-color,border-color,box-shadow] duration-200 enabled:hover:border-[#b39acb] enabled:hover:bg-white enabled:hover:shadow-[0_4px_12px_-8px_rgba(90,42,128,0.3),inset_0_1px_0_white] focus-visible:border-primary focus-visible:bg-white focus-visible:shadow-[0_0_0_4px_rgba(129,39,207,0.08),0_4px_12px_-8px_rgba(90,42,128,0.3)] placeholder:font-normal placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-ink-muted disabled:shadow-none aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-red-50/60 aria-[invalid=true]:focus-visible:outline-destructive",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
