// SKAI-1428: trip times are stored as UTC instants. The revision form edits them as datetime-local values.
// The prefill and the save use the same local clock, so an unchanged time round-trips to the exact stored instant.

const two = (n: number) => String(n).padStart(2, "0");

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}

// An unchanged field keeps the stored instant; an edited field is read as local time.
export function instantFromLocal(value: string, original?: { input: string; iso: string }): string {
  if (original && value === original.input) return original.iso;
  return new Date(value).toISOString();
}
