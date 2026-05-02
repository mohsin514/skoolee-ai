// ===========================================
// shadcn/ui - Badge Component
// ===========================================

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black transition-colors focus:outline-none focus:ring-2 focus:ring-[#8127cf]/20 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#8127cf] text-white shadow-sm",
        secondary:
          "border-transparent bg-[#fbf0fe] text-[#8127cf]",
        destructive:
          "border-transparent bg-rose-500 text-white shadow-sm",
        outline: "border-[#cfc2d6]/40 bg-white text-[#4d4354]",
        success:
          "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        warning:
          "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
