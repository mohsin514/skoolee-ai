// ===========================================
// shadcn/ui - Card Component
// ===========================================

import * as React from "react";
import { cn } from "@/lib/utils";

export const cardSurface = "sk-panel text-ink-strong transition-all duration-200";

/**
 * default  — white panel, hairline border, soft plum shadow.
 * featured — the same panel with a violet-to-berry gradient hairline, for the
 *            one card on a screen that deserves the eye (plan, AI, highlight).
 * muted    — a recessed lilac surface for secondary groupings inside a page.
 * glass    — frosted, for cards floating over imagery or the brand surface.
 */
export type CardVariant = "default" | "featured" | "muted" | "glass";

const cardVariants: Record<CardVariant, string> = {
  default: "",
  featured: "sk-gradient-border shadow-md hover:border-transparent",
  muted: "border-border-subtle bg-surface-subtle shadow-none",
  glass: "sk-glass",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant = "default", ...props }, ref) => {
  const interactive = typeof props.onClick === "function";
  return (
    <div
      ref={ref}
      data-variant={variant === "default" ? undefined : variant}
      className={cn(
        cardSurface,
        cardVariants[variant],
        interactive
          ? "cursor-pointer hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] motion-reduce:hover:translate-y-0"
          : variant === "default" && "hover:border-primary/20",
        className
      )}
      {...props}
    />
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6 pb-4", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-lg font-bold leading-snug tracking-[-0.01em] text-ink-strong", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm leading-relaxed text-ink-muted", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
