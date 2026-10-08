// ===========================================
// shadcn/ui - Input Component
// ===========================================

import * as React from "react";
import { fieldAppearance } from "./field-appearance";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex min-h-12 w-full px-4 py-2.5",
        className,
        fieldAppearance
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
