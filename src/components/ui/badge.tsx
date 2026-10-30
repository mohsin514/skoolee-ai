// ===========================================
// shadcn/ui - Badge Component
// ===========================================

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1.5 rounded-full border font-semibold leading-none transition-colors [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-white shadow-[0_2px_6px_-2px_rgb(129_39_207/0.5)]",
        secondary: "border-brand-200/70 bg-brand-50 text-brand-700",
        destructive: "border-transparent bg-rose-600 text-white shadow-sm",
        outline: "border-edge/60 bg-white text-ink",
        success: "border-emerald-200 bg-emerald-50 text-emerald-800",
        warning: "border-amber-200 bg-amber-50 text-amber-800",
        danger: "border-red-200 bg-red-50 text-red-800",
        info: "border-blue-200 bg-blue-50 text-blue-800",
        neutral: "border-border-subtle bg-surface-subtle text-ink-muted",
      },
      size: {
        sm: "px-2 py-0.5 text-2xs",
        default: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const dots: Partial<Record<NonNullable<BadgeProps["variant"]>, string>> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
  neutral: "bg-ink-faint",
  secondary: "bg-primary",
  outline: "bg-ink-faint",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** A leading status dot; colour follows the variant. */
  dot?: boolean;
}

function Badge({ className, variant, size, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot ? <span aria-hidden="true" data-badge-dot={variant ?? "default"} className={cn("size-1.5 shrink-0 rounded-full", dots[variant ?? "default"] ?? "bg-white")} /> : null}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
