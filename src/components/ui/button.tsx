// ===========================================
// shadcn/ui - Button Component
// ===========================================

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative overflow-hidden sk-sweep-trigger inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf0fe] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-[0_10px_26px_-8px_rgba(129,39,207,0.45)] hover:shadow-[0_16px_38px_-10px_rgba(129,39,207,0.58)] active:scale-[0.98]",
        destructive:
          "bg-rose-500 text-white shadow-lg shadow-rose-500/15 hover:bg-rose-600 active:scale-[0.98]",
        outline:
          "border border-[#cfc2d6]/30 bg-white/60 text-ink shadow-sm hover:border-[#8127cf]/30 hover:bg-[#fbf0fe] hover:text-[#8127cf] active:scale-[0.98]",
        secondary:
          "bg-[#fbf0fe] text-[#8127cf] shadow-sm hover:bg-[#eadfed] active:scale-[0.98]",
        ghost: "text-ink hover:bg-[#fbf0fe] hover:text-[#8127cf]",
        link: "text-[#8127cf] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-14 rounded-xl px-8 text-base",
        icon: "h-10 w-10",
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
        {variant === "default" && !props.disabled && (
          <span aria-hidden className="sk-sweep bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        )}
        {props.children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
