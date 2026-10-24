"use client";

import { useCallback } from "react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { countLabel, type CountNoun } from "@/lib/locale/count-label";

/** SKO-480: `count(1, "student")` → "1 student", "طالب واحد", "1 طالب علم". */
export function useCountLabel() {
  const { language } = useLocale();
  return useCallback((n: number, noun: CountNoun) => countLabel(language, n, noun), [language]);
}
