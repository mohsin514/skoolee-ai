import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldAppearance } from "./field-appearance";

/** A single field surface with in-flow icon/action slots; works in either direction. */
export const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} {...props} className={cn(
    className, fieldAppearance,
    "shadow-[0_2px_3px_-2px_rgba(55,27,77,0.12)] sk-input-group group relative flex min-h-12 min-w-0 items-center hover:border-[#b39acb] focus-within:border-primary focus-within:bg-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
  )} />,
);
InputGroup.displayName = "InputGroup";
