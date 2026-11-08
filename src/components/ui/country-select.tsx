"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
import { sortedCountries } from "@/lib/locale/world-countries";

const COPY = {
  en: { popular: "Popular", all: "All countries" },
  ar: { popular: "الأكثر استخداماً", all: "جميع الدول" },
  ur: { popular: "مقبول", all: "تمام ممالک" },
} as const;

/**
 * Every country (ISO 3166-1 alpha-2), the featured markets first and the rest
 * alphabetical in the reader's language. Shared by register, onboarding and
 * settings so a school's country is picked from one list everywhere.
 */
export type CountrySelectProps = Omit<React.ComponentProps<typeof Select>, "value" | "onChange" | "children"> & {
  value: string;
  onChange(iso: string): void;
  language?: string;
};

export function CountrySelect({ value, onChange, language = "en", ...props }: CountrySelectProps) {
  const lang = language === "ar" || language === "ur" ? language : "en";
  const list = React.useMemo(() => sortedCountries(lang), [lang]);
  return (
    <Select {...props} value={value} onChange={(event) => onChange(event.target.value)}>
      <optgroup label={COPY[lang].popular}>
        {list.featured.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
      </optgroup>
      <optgroup label={COPY[lang].all}>
        {list.rest.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
      </optgroup>
    </Select>
  );
}
