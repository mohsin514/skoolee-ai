// ===========================================
// shadcn/ui - Button Component
// ===========================================

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-normal rounded-2xl text-sm font-bold transition-[background-color,border-color,box-shadow,transform] duration-200 enabled:active:scale-[0.98] motion-reduce:transform-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-ink-muted disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-[#6d22b4] bg-primary bg-gradient-to-b from-[#8c36d5] to-[#7423ba] text-primary-foreground shadow-[0_7px_15px_-7px_rgba(106,31,176,0.6),inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(56,12,99,0.15)] enabled:hover:border-[#5d149f] enabled:hover:from-[#812aca] enabled:hover:to-[#6820aa] enabled:hover:shadow-[0_9px_20px_-7px_rgba(106,31,176,0.55),inset_0_1px_0_rgba(255,255,255,0.3)] enabled:active:shadow-[0_2px_6px_-2px_rgba(106,31,176,0.45),inset_0_1px_3px_rgba(56,12,99,0.2)] disabled:bg-none",
        dark: "border border-[#1f1a23] bg-[#1f1a23] text-white shadow-md enabled:hover:bg-black",
        destructive: "border border-destructive bg-destructive text-destructive-foreground shadow-[0_4px_10px_-6px_rgba(153,27,27,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] enabled:hover:bg-red-900",
        outline: "border border-[#d8cfe5] bg-white text-ink shadow-[0_2px_3px_-2px_rgba(55,27,77,0.16),inset_0_1px_0_white] enabled:hover:border-[#b59bce] enabled:hover:bg-[#faf5ff] enabled:hover:text-primary enabled:hover:shadow-[0_5px_12px_-8px_rgba(90,42,128,0.35)]",
        secondary: "border border-[#e3d5f0] bg-[#f1e7fb] text-[#7020b9] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] enabled:hover:border-[#cdb2e6] enabled:hover:bg-[#eaddf6]",
        ghost: "text-ink enabled:hover:bg-[#f3ecfa] enabled:hover:text-primary",
        link: "text-primary underline-offset-4 enabled:hover:underline",
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
