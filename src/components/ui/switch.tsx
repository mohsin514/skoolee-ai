import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "role"> {
  size?: "sm" | "md";
}

/**
 * An on/off setting that takes effect immediately. A native checkbox with
 * role="switch" underneath, so forms, labels, keyboard and screen readers
 * behave as they always have; only the painted track and thumb are custom.
 * Use Checkbox instead when the choice is submitted with a form.
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, size = "md", ...props }, ref) => {
  const small = size === "sm";
  return (
    <span className={cn("sk-switch relative inline-flex shrink-0 align-middle", small ? "h-5 w-9" : "h-6 w-11", className)}>
      <input
        {...props}
        ref={ref}
        type="checkbox"
        role="switch"
        className="sk-switch-input peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden="true"
        className="sk-switch-track pointer-events-none absolute inset-0 rounded-full border border-[#cdbfd9] bg-[#e9e2ef] shadow-[inset_0_1px_2px_rgb(55_27_77/0.12)] transition-[background-color,border-color] duration-200 peer-checked:border-brand-700 peer-checked:bg-primary peer-disabled:opacity-60 peer-aria-[invalid=true]:border-destructive"
      />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 start-0.5 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgb(120_70_180/0.3)] transition-transform duration-200 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none",
          small ? "size-4 peer-checked:translate-x-4 rtl:peer-checked:-translate-x-4" : "size-5 peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5",
        )}
      />
    </span>
  );
});
Switch.displayName = "Switch";
