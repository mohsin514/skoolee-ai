import * as React from "react";
import { cn } from "@/lib/utils";

export const pageCardSurface = "min-w-0 rounded-[24px] border border-[#e4dced] bg-white p-3 text-foreground shadow-[0_2px_4px_rgba(40,23,60,0.02),0_20px_60px_-30px_rgba(80,42,118,0.25),inset_0_1px_0_white] sm:rounded-[32px] sm:p-7";

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
