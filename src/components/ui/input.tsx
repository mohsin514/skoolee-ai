"use client";

import * as React from "react";
import { Input as NativeInput } from "./input-base";
import { DatePicker } from "./date-picker";

/** All date fields share the calendar while retaining native input events and refs. */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ type, value, defaultValue, ...props }, ref) => type === "date" ? (
    <DatePicker {...props} ref={ref} label={props["aria-label"] || "Date"}
      value={value === undefined ? undefined : String(value)}
      defaultValue={defaultValue === undefined ? undefined : String(defaultValue)} />
  ) : <NativeInput {...props} dir={props.dir ?? (["tel", "email", "url", "number"].includes(type ?? "") ? "ltr" : undefined)} ref={ref} type={type} value={value} defaultValue={defaultValue} />,
);
Input.displayName = "Input";
export { Input };
