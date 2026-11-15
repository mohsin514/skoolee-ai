// SKAI-1428: trip times are stored as UTC instants. The revision form edits them as datetime-local values
// on the campus clock (the school's timezone), never the staff device clock.
// The prefill and the save use the same campus clock, so an unchanged time round-trips to the exact stored instant.
import { localParts } from "../meetings/time";
import { campusInstant } from "./week";

/** The campus wall clock of a stored instant, as a datetime-local value ("YYYY-MM-DDTHH:MM"). */
export function toLocalInput(iso: string, timeZone: string): string {
  const { date, time } = localParts(new Date(iso), timeZone);
  return `${date}T${time}`;
}

// An unchanged field keeps the stored instant; an edited field is read as the campus wall clock.
export function instantFromLocal(value: string, timeZone: string, original?: { input: string; iso: string }): string {
  if (original && value === original.input) return original.iso;
  const instant = campusInstant(value, timeZone);
  if (!instant) throw new RangeError("Enter a valid date and time");
  return instant;
}
