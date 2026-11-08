import * as React from "react";
import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

/** Native form and keyboard behavior, with a consistent Skoolee selection mark. */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      className={cn(
        "inline-block size-5 shrink-0 cursor-pointer appearance-none rounded-[7px] border-2 border-[#bcaaca] bg-white bg-center bg-no-repeat align-middle shadow-[0_1px_2px_rgba(55,27,77,0.08),inset_0_1px_0_white] transition-[background-color,border-color,box-shadow] duration-150 enabled:hover:border-primary enabled:hover:shadow-[0_0_0_3px_rgba(129,39,207,0.07)] checked:border-primary checked:bg-primary checked:shadow-[0_2px_5px_-2px_rgba(129,39,207,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2020%2020%22%20fill=%22none%22%3E%3Cpath%20d=%22m5%2010%203.1%203.1L15%206.5%22%20stroke=%22white%22%20stroke-width=%222.2%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/%3E%3C/svg%3E')] indeterminate:border-primary indeterminate:bg-primary indeterminate:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2020%2020%22%3E%3Cpath%20d=%22M5%2010h10%22%20stroke=%22white%22%20stroke-width=%222.2%22%20stroke-linecap=%22round%22/%3E%3C/svg%3E')] disabled:cursor-not-allowed disabled:border-[#cec4d6] disabled:bg-[#f0ebf4] disabled:shadow-none disabled:checked:border-[#9682a7] disabled:checked:bg-[#9682a7] aria-[invalid=true]:border-destructive forced-colors:appearance-auto forced-colors:shadow-none forced-colors:checked:bg-none forced-colors:indeterminate:bg-none",
        className,
      )}
    />
  ),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
