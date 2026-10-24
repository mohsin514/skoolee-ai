"use client";

import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { datePickerMessages } from "@/lib/locale/date-picker-messages";
import * as React from "react";
import { Input as NativeInput } from "./input-base";
import { DatePicker } from "./date-picker";

/** All date fields share the calendar while retaining native input events and refs. */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ type, value, defaultValue, ...props }, ref) => {
    const locale = useLocale(); const tr = useUiText();
    return type === "date" ? (
    <DatePicker {...props} ref={ref} locale={localeTag(locale)} todayDate={new Intl.DateTimeFormat("en-CA", { timeZone: locale.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())} weekStartsOn={locale.weekStartsOn as 0|1|2|3|4|5|6} messages={datePickerMessages[locale.language]} dir={props.dir || (locale.language === "en" ? "ltr" : "rtl")} label={props["aria-label"] || tr("Date")}
      value={value === undefined ? undefined : String(value)}
      defaultValue={defaultValue === undefined ? undefined : String(defaultValue)} />
  ) : <NativeInput {...props} dir={props.dir ?? (["tel", "email", "url", "number"].includes(type ?? "") ? "ltr" : undefined)} ref={ref} type={type} value={value} defaultValue={defaultValue} />;
  },
);
Input.displayName = "Input";
export { Input };
