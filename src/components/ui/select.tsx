// ===========================================
// shadcn/ui - Select Component
// ===========================================

"use client";

import * as React from "react";
import { fieldAppearance } from "./field-appearance";
import { cn } from "@/lib/utils";

const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  return (
    <select
      className={cn(
        "sk-select flex min-h-12 w-full cursor-pointer px-4 py-2.5",
        className,
        fieldAppearance
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
