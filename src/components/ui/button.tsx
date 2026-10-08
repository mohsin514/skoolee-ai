// ===========================================
// shadcn/ui - Button Component
// ===========================================

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-w-11 cursor-pointer items-center justify-center gap-2 whitespace-normal rounded-2xl text-sm font-bold transition-[background-color,border-color,box-shadow,transform] duration-200 motion-safe:actionable-active:scale-[0.98] motion-reduce:transform-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-ink-muted disabled:shadow-none [&_svg]:pointer-events-none [&>svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-[#6d22b4] bg-primary bg-gradient-to-b from-[#8c36d5] to-[#7423ba] text-primary-foreground shadow-[0_7px_15px_-7px_rgba(106,31,176,0.6),inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(56,12,99,0.15)] actionable-hover:border-[#5d149f] actionable-hover:from-[#812aca] actionable-hover:to-[#6820aa] actionable-hover:shadow-[0_9px_20px_-7px_rgba(106,31,176,0.55),inset_0_1px_0_rgba(255,255,255,0.3)] actionable-active:shadow-[0_2px_6px_-2px_rgba(106,31,176,0.45),inset_0_1px_3px_rgba(56,12,99,0.2)] disabled:bg-none",
        dark: "border border-[#1f1a23] bg-[#1f1a23] text-white shadow-md actionable-hover:bg-black",
        destructive: "border border-destructive bg-destructive text-destructive-foreground shadow-[0_4px_10px_-6px_rgba(153,27,27,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] actionable-hover:bg-red-900",
        outline: "border border-[#d8cfe5] bg-white text-ink shadow-[0_2px_3px_-2px_rgba(55,27,77,0.16),inset_0_1px_0_white] actionable-hover:border-[#b59bce] actionable-hover:bg-[#faf5ff] actionable-hover:text-primary actionable-hover:shadow-[0_5px_12px_-8px_rgba(90,42,128,0.35)]",
        secondary: "border border-[#e3d5f0] bg-[#f1e7fb] text-[#7020b9] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] actionable-hover:border-[#cdb2e6] actionable-hover:bg-[#eaddf6]",
        ghost: "text-ink actionable-hover:bg-[#f3ecfa] actionable-hover:text-primary",
        link: "text-primary underline-offset-4 actionable-hover:underline",
        choice: "border border-border-subtle bg-surface-subtle text-ink actionable-hover:border-border-subtle-hover actionable-hover:bg-surface-hover aria-checked:border-primary aria-checked:bg-surface-selected aria-pressed:border-primary aria-pressed:bg-surface-selected aria-[current=step]:border-primary aria-[current=step]:bg-surface-selected data-[selected=true]:border-primary data-[selected=true]:bg-surface-selected",
      },
      size: {
        default: "min-h-11 px-4 py-2.5",
        sm: "min-h-11 rounded-xl px-3 text-xs",
        lg: "min-h-14 rounded-2xl px-8 py-3 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {props.children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
