"use client";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LANGUAGES, type Language } from "@/lib/locale/package";
import { LANGUAGE_NATIVE_NAMES, parseLanguage } from "@/lib/locale/language-cookie";

type Props = {
  id: string;
  label: string;
  value: Language | "";
  onChange: (value: Language | "") => void;
  disabled?: boolean;
  /** Adds a `""` option, e.g. "School default (English)". */
  inheritLabel?: string;
  /** Extra ids for the select's accessible description. */
  describedBy?: string;
  /** Reserved for a future school policy that locks the personal language (design §B.1.6). */
  lockedReason?: string;
  className?: string;
};

/** The one language picker used by every auth page and by Settings. Options are always in their own script. */
export function LanguageSelect({ id, label, value, onChange, disabled, inheritLabel, describedBy, lockedReason, className }: Props) {
  return (
    <FormField name="language" id={id} label={label} hint={lockedReason} className={cn("w-full max-w-48", className)}>
      <Select
        value={value}
        disabled={disabled || Boolean(lockedReason)}
        aria-describedby={describedBy}
        onChange={event => onChange(event.target.value === "" && inheritLabel ? "" : parseLanguage(event.target.value) ?? "en")}
      >
        {inheritLabel ? <option value="">{inheritLabel}</option> : null}
        {LANGUAGES.map(lang => <option key={lang} value={lang} lang={lang}>{LANGUAGE_NATIVE_NAMES[lang]}</option>)}
      </Select>
    </FormField>
  );
}
