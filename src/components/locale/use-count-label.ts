"use client";

import { useCallback } from "react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { countLabel, isSingularCount, type CountNoun } from "@/lib/locale/count-label";

/** SKO-480: `count(1, "student")` → "1 student", "طالب واحد", "1 طالب علم". */
export function useCountLabel() {
  const { language } = useLocale();
  return useCallback((n: number, noun: CountNoun) => countLabel(language, n, noun), [language]);
}

/** SKAI-1025: `singular(1)` is true, so a tile can label "1" as "Class" rather than "Classes". */
export function useIsSingular() {
  const { language } = useLocale();
  return useCallback((n: number) => isSingularCount(language, n), [language]);
}
