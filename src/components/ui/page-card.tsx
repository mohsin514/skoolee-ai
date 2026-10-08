import * as React from "react";
import { cn } from "@/lib/utils";

export const pageCardSurface = "min-w-0 rounded-(--radius-workspace-mobile) border border-border-subtle bg-white p-3 text-foreground shadow-(--shadow-workspace) sm:rounded-(--radius-workspace) sm:p-7";

/** Main workspace surface. Keep navigation outside and task sections inside. */
const PageCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
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
