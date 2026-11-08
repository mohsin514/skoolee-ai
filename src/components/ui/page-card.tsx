import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The one page card (addendum 2026-10-22, item 2). Every console view and framed route renders inside exactly ONE of
 * these, drawn once by the shell (RoleShell / RoleFrame main region): shared radius, padding and shadow, token
 * surface (`bg-card`, so it follows the theme). Pages never draw their own outer card on top of it; inner panels stay
 * `sk-panel` sections. Pages that sit outside a shell (suspended plan, payment return) use `PageCard` directly.
 */
export const pageCardSurface = "min-w-0 rounded-(--radius-workspace-mobile) border border-border-subtle bg-card p-3 text-foreground shadow-(--shadow-workspace) sm:rounded-(--radius-workspace) sm:p-7";

/** Main workspace surface. Keep navigation outside and task sections inside. */
const PageCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-page-card=""
      className={cn(
        pageCardSurface,
        className,
      )}
      {...props}
    />
  ),
);
PageCard.displayName = "PageCard";

export { PageCard };
