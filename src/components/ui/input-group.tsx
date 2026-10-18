import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldAppearance } from "./field-appearance";
import { Tooltip } from "./tooltip";

/** A single field surface with in-flow icon/action slots; works in either direction. */
export const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { surfaceClassName?: string }>(
  ({ className, surfaceClassName, ...props }, ref) => <div ref={ref} {...props} className={cn(
    className, fieldAppearance,
    "sk-input-group group relative flex min-h-12 min-w-0 items-center hover:border-field-border-hover",
    surfaceClassName,
  )} />,
);
InputGroup.displayName = "InputGroup";

/**
 * An inline field action keeps the group's single surface and native button
 * semantics. Pass `label` for an icon-only action (reveal, clear, calendar):
 * it becomes the accessible name and the shared tooltip, as with IconButton.
 */
export const FieldAction = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }>(
  ({ className, type = "button", label, ...props }, ref) => {
    const button = (
      <button ref={ref} type={type} data-field-affix="end" aria-label={label ?? props["aria-label"]} {...props} className={cn("shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:size-4", className)} />
    );
    return label ? <Tooltip content={label} describe={false}>{button}</Tooltip> : button;
  },
);
FieldAction.displayName = "FieldAction";
