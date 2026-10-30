// ===========================================
// shadcn/ui - Button Component
// ===========================================

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex min-w-11 cursor-pointer items-center justify-center gap-2 whitespace-normal rounded-2xl text-sm font-semibold tracking-[-0.005em] transition-[background-color,border-color,box-shadow,transform,color] duration-200 motion-safe:actionable-active:scale-[0.98] motion-reduce:transform-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-ink-muted disabled:shadow-none aria-busy:cursor-progress [&_svg]:pointer-events-none [&>svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Plum ink: deep brand-900 purple with a lit top edge; on hover it picks up a brand-purple rim and glow without moving its hit target. Icons take a soft lilac.
        default: "sk-btn-primary border border-brand-900 bg-brand-900 bg-gradient-to-b from-brand-800 to-brand-900 text-white [&_svg]:text-brand-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_22px_-12px_rgba(120,70,180,0.7)] actionable-hover:from-brand-700 actionable-hover:to-brand-800 actionable-hover:border-brand-400 actionable-hover:shadow-[inset_0_0_0_1px_rgba(156,72,234,0.9),0_12px_26px_-12px_rgba(129,39,207,0.8)] actionable-active:shadow-[inset_0_1px_3px_rgba(120,70,180,0.35)] disabled:bg-none",
        dark: "border border-ink-strong bg-ink-strong text-white shadow-[0_6px_14px_-8px_rgba(120,70,180,0.6),inset_0_1px_0_rgba(255,255,255,0.12)] actionable-hover:bg-black",
        destructive: "border border-destructive bg-destructive text-destructive-foreground shadow-[0_4px_10px_-6px_rgba(153,27,27,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] actionable-hover:bg-red-900",
        outline: "border border-field-border bg-white text-ink shadow-[0_2px_3px_-2px_rgba(55,27,77,0.16),inset_0_1px_0_white] actionable-hover:border-[#b59bce] actionable-hover:bg-surface-hover actionable-hover:text-primary actionable-hover:shadow-[0_5px_12px_-8px_rgba(90,42,128,0.35)]",
        secondary: "border border-brand-200 bg-[#f1e7fb] text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] actionable-hover:border-[#cdb2e6] actionable-hover:bg-[#eaddf6]",
        ghost: "text-ink actionable-hover:bg-brand-100 actionable-hover:text-primary",
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
    VariantProps<typeof buttonVariants> {
  /**
   * Shows a spinner in place of the leading icon, marks the button busy and
   * blocks repeat presses while the action runs. The label stays, so the
   * button keeps its width and its name.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
