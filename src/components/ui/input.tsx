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
        "flex h-11 w-full rounded-xl border border-transparent bg-[#f3f4f9] px-3 py-2 text-sm font-semibold text-[#1f1a23] shadow-none transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#4d4354]/35 focus-visible:border-[#8127cf]/25 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]/15 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
