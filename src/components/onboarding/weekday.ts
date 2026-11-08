/**
 * Weekday names for the setup wizard. ISO numbering: 1 = Monday … 7 = Sunday
 * (2024-01-01 is a Monday). Always formatted in UTC so the name never shifts
 * with the viewer's time zone. Intl output can differ between engines, so
 * callers render it after load (the wizard's server frame is its skeleton).
 */
export const ISO_WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function weekdayName(day: number, language: string, style: "short" | "long" | "narrow") {
  const date = new Date(Date.UTC(2024, 0, day));
  const name = new Intl.DateTimeFormat(language, { weekday: style, timeZone: "UTC" }).format(date);
  // Some engines have no narrow Urdu names and fall back to Latin initials: use the first letter of the long name.
  if (style === "narrow" && !language.startsWith("en") && /^[A-Za-z]+$/.test(name)) {
    return Array.from(new Intl.DateTimeFormat(language, { weekday: "long", timeZone: "UTC" }).format(date))[0] ?? name;
  }
  return name;
}
