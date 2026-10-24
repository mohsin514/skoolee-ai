"use client";

import * as React from "react";
import { Button, type ButtonProps } from "./button";
import { Tooltip } from "./tooltip";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends Omit<ButtonProps, "size" | "aria-label"> {
  /** Required: the accessible name, and the tooltip text unless `tooltip` overrides it. */
  label: string;
  /** Visible tooltip content. `false` hides it (the label is still announced). */
  tooltip?: React.ReactNode | false;
  tooltipSide?: "top" | "bottom";
  /** sm = 36px for dense desktop toolbars; md = 44px (the touch target). */
  size?: "sm" | "md";
}

const sizes = {
  sm: "h-9 w-9 min-h-9 min-w-9 rounded-xl [&>svg]:size-4",
  md: "h-11 w-11 min-h-11 min-w-11 rounded-2xl [&>svg]:size-[18px]",
} as const;

/**
 * An icon-only action. It cannot be built without a label, and the label is
 * shown as a tooltip, so nobody has to guess what a bare icon does.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, tooltip, tooltipSide = "top", size = "md", variant = "ghost", className, children, type = "button", ...props }, ref) => {
    const button = (
      <Button
        ref={ref}
        type={type}
        variant={variant}
        size="icon"
        aria-label={label}
        className={cn("shrink-0 p-0", sizes[size], className)}
        {...props}
      >
        {children}
      </Button>
    );
    if (tooltip === false) return button;
    return (
      <Tooltip content={tooltip ?? label} describe={tooltip !== undefined && tooltip !== label} side={tooltipSide}>
        {button}
      </Tooltip>
    );
  },
);
IconButton.displayName = "IconButton";
