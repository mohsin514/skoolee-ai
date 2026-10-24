"use client";
import * as React from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { useLocale, useLocaleFormat } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", Number.POSITIVE_INFINITY],
];

/**
 * Locale-correct counts, role lists and times for every AI Workflows surface:
 * the school's numbering system, Arabic/Urdu list separators and plain role
 * names. Use instead of Intl.NumberFormat(language), toLocaleDateString or
 * roles.join(", ").
 */
export function useWorkflowFormat() {
  const locale = useLocale();
  const format = useLocaleFormat();
  return React.useMemo(() => {
    const tag = localeTag(locale);
    const language = locale.language;
    return {
      count: (n: number) => format.number(n, 0),
      roles: (roles: string[], type: "disjunction" | "conjunction" = "disjunction") => {
        const labels = [...new Set(roles.map(role => roleLabel(role, language)))];
        if (labels.length === 0) return "";
        try { return new Intl.ListFormat(language, { type, style: "long" }).format(labels); }
        catch { return labels.join(language === "en" ? ", " : "، "); }
      },
      relative: (iso: string) => {
        const then = new Date(iso).getTime();
        if (!Number.isFinite(then)) return "";
        let value = (then - Date.now()) / 1000;
        let unit: Intl.RelativeTimeFormatUnit = "second";
        for (const [name, size] of UNITS) {
          unit = name;
          if (Math.abs(value) < size) break;
          value /= size;
        }
        return new Intl.RelativeTimeFormat(tag, { numeric: "auto" }).format(Math.round(value), unit);
      },
      absolute: (iso: string) => format.dateTime(iso),
    };
  }, [locale, format]);
}

/** A count in the school's digits, isolated for bidi and with even-width figures. */
export function Num({ value, className }: { value: number; className?: string }) {
  const { count } = useWorkflowFormat();
  return <bdi data-numeric className={cn("tabular-nums", className)}>{count(value)}</bdi>;
}

/** "3 hours ago" with the absolute time in the shared Tooltip. */
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  const { relative, absolute } = useWorkflowFormat();
  // Relative text depends on "now": render it after mount so server and client agree.
  const [label, setLabel] = React.useState<string | null>(null);
  React.useEffect(() => { setLabel(relative(iso)); }, [iso, relative]);
  const full = absolute(iso);
  return (
    <Tooltip content={full}>
      <time dateTime={iso} tabIndex={0} className={cn("rounded-sm", className)}><bdi>{label ?? full}</bdi></time>
    </Tooltip>
  );
}
