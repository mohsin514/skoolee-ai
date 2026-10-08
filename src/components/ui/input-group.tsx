import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldAppearance } from "./field-appearance";

/** A single field surface with in-flow icon/action slots; works in either direction. */
export const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { surfaceClassName?: string }>(
  ({ className, surfaceClassName, ...props }, ref) => <div ref={ref} {...props} className={cn(
    className, fieldAppearance,
    "sk-input-group group relative flex min-h-12 min-w-0 items-center hover:border-field-border-hover",
    surfaceClassName,
  )} />,
);
InputGroup.displayName = "InputGroup";
