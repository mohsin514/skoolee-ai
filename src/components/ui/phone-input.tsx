"use client";

import * as React from "react";
import { Phone } from "lucide-react";
import { InputGroup } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { dialCodeFor, sortedCountries, WORLD_COUNTRIES } from "@/lib/locale/world-countries";

/**
 * The one phone field: a country-code picker and the national number on a
 * single field surface. Register, onboarding and settings all use it, so the
 * same countries, placeholders and stored shape ("+92 3001234567") hold
 * everywhere.
 *
 * Controlled two ways:
 *  - `country` + `number` (split): the caller keeps both parts (register).
 *  - `value` (joined): the caller stores one string; it is split on read and
 *    joined on write with `joinPhone` (onboarding drafts).
 */
const COPY = {
  en: { dialCode: "Country code", popular: "Popular", all: "All countries", placeholder: "Phone number" },
  ar: { dialCode: "رمز الدولة", popular: "الأكثر استخداماً", all: "جميع الدول", placeholder: "رقم الهاتف" },
  ur: { dialCode: "ملک کا کوڈ", popular: "مقبول", all: "تمام ممالک", placeholder: "فون نمبر" },
} as const;

/** National-number placeholder for a dial code (the code itself is in the picker). */
export const PHONE_PLACEHOLDER: Record<string, string> = {
  "+92": "300 1234567",
  "+966": "5X XXX XXXX",
  "+971": "5X XXX XXXX",
  "+965": "XXXX XXXX",
  "+974": "XXXX XXXX",
  "+968": "XXXX XXXX",
  "+973": "XXXX XXXX",
  "+91": "98765 43210",
  "+880": "1712 345678",
  "+44": "7400 123456",
  "+1": "201 555 0123",
  "+20": "100 123 4567",
  "+234": "802 123 4567",
  "+254": "712 345678",
  "+27": "71 123 4567",
  "+60": "12 345 6789",
  "+65": "8123 4567",
  "+61": "412 345 678",
};

/** One stored string: a number typed with its own "+" wins, otherwise the picked code is prefixed. */
export function joinPhone(dial: string, number: string): string {
  const national = number.trim();
  if (!national) return "";
  return national.startsWith("+") ? national : `${dial} ${national.replace(/^0+/, "")}`;
}

/**
 * Splits a stored phone into its country and national number. The longest
 * matching dial code wins; shared codes (+1, +7) keep `fallbackIso` when it
 * carries that code. A number without "+" stays whole under `fallbackIso`.
 */
export function splitPhone(value: string, fallbackIso: string): { country: string; number: string } {
  const raw = value.trim();
  const fallback = WORLD_COUNTRIES.some(([iso]) => iso === fallbackIso) ? fallbackIso : "PK";
  if (!raw.startsWith("+")) return { country: fallback, number: raw };
  const compact = raw.replace(/[\s\-()]/g, "");
  let best: { iso: string; dial: string } | null = null;
  for (const [iso, dial] of WORLD_COUNTRIES) {
    if (!compact.startsWith(dial)) continue;
    if (!best || dial.length > best.dial.length || (dial === best.dial && iso === fallback)) best = { iso, dial };
  }
  if (!best) return { country: fallback, number: raw };
  // Skip past the code's digits (spacing inside the code is tolerated).
  let seen = 0;
  let i = 1;
  while (i < raw.length && seen < best.dial.length - 1) {
    if (/\d/.test(raw[i])) seen++;
    i++;
  }
  return { country: best.iso, number: raw.slice(i).replace(/^[\s\-()]+/, "") };
}

type Language = keyof typeof COPY;

type SplitProps = { country: string; number: string; onCountryChange(iso: string): void; onNumberChange(number: string): void; value?: never; onChange?: never };
type JoinedProps = { value: string; onChange(value: string): void; country?: never; number?: never; onCountryChange?: never; onNumberChange?: never };

export type PhoneInputProps = {
  id: string;
  /** The country the picker starts on when the value has no code (the school's country). */
  defaultCountry?: string;
  language?: string;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
  disabled?: boolean;
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  className?: string;
} & (SplitProps | JoinedProps);

export function PhoneInput(props: PhoneInputProps) {
  const { id, defaultCountry = "PK", language = "en", invalid, describedBy, required, disabled, enterKeyHint = "next", className } = props;
  const lang: Language = language === "ar" || language === "ur" ? language : "en";
  const copy = COPY[lang];
  const list = React.useMemo(() => sortedCountries(lang), [lang]);

  // Joined mode keeps the picked country locally while the number is empty, so a
  // country change before typing is not lost to the fallback.
  const [pickedIso, setPickedIso] = React.useState<string | null>(null);
  const joined = props.value !== undefined;
  const parts = joined ? splitPhone(props.value!, pickedIso ?? defaultCountry) : { country: props.country!, number: props.number! };
  const dial = dialCodeFor(parts.country);

  const setCountry = (iso: string) => {
    if (joined) {
      setPickedIso(iso);
      props.onChange!(joinPhone(dialCodeFor(iso), parts.number));
    } else props.onCountryChange!(iso);
  };
  const setNumber = (raw: string) => {
    const number = raw.replace(/[^\d\s+\-()]/g, "");
    if (joined) props.onChange!(joinPhone(dial, number));
    else props.onNumberChange!(number);
  };

  const option = (c: { iso: string; dial: string; name: string }) => (
    <option key={c.iso} value={c.iso}>{c.iso === parts.country ? `${c.iso} ${c.dial}` : `${c.iso} ${c.dial} · ${c.name}`}</option>
  );

  return (
    <InputGroup className={className}>
      <Phone aria-hidden data-field-affix="start" className="h-4 w-4 text-ink-subtle" />
      <Select
        aria-label={copy.dialCode}
        data-field-companion=""
        value={parts.country}
        disabled={disabled}
        onChange={(event) => setCountry(event.target.value)}
        className="sk-dial-code"
      >
        <optgroup label={copy.popular}>{list.featured.map(option)}</optgroup>
        <optgroup label={copy.all}>{list.rest.map(option)}</optgroup>
      </Select>
      <Input
        id={id}
        type="tel"
        dir="ltr"
        autoComplete="tel-national"
        inputMode="tel"
        enterKeyHint={enterKeyHint}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        placeholder={PHONE_PLACEHOLDER[dial] ?? copy.placeholder}
        value={parts.number}
        onChange={(event) => setNumber(event.target.value)}
      />
    </InputGroup>
  );
}
