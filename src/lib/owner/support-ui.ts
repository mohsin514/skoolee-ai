/** Formats an expiry with a visible local timezone label for support screens. */
export function formatSupportInstant(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}
