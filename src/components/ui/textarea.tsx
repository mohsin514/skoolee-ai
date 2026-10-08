// ===========================================
// shadcn/ui - Textarea Component
// ===========================================

import * as React from "react";
import { fieldAppearance } from "./field-appearance";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "sk-field flex min-h-[104px] w-full resize-y px-4 py-3 leading-relaxed",
        className,
        fieldAppearance
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
