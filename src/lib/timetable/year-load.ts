/**
 * SKAI-1966: the timetable editors list every year from a slot-free index (GET /api/timetable?view=index)
 * and load slots for the selected year only (?academicYear=). No server or database imports.
 */
import { defaultTimetableYear } from "@/lib/timetable/view-scope";

type Row = { id: string; academicYear: number; slots: unknown[] };

export function timetableListUrl(campusId: string | undefined, query: Record<string, string | number>) {
  const params = new URLSearchParams();
  if (campusId) params.set("campusId", campusId);
  for (const [key, value] of Object.entries(query)) params.set(key, String(value));
  return `/api/timetable?${params.toString()}`;
}

/** Index rows arrive without slots; they hold an empty list until their year is loaded. */
export function indexRows<T extends Row>(rows: Array<Omit<T, "slots">>): T[] {
  return rows.map(row => ({ ...row, slots: [] }) as unknown as T);
}

/** The year the editor opens on: the year it already showed when still listed, else the usual default. */
export function timetableLoadYear(index: Array<{ academicYear: number }>, classes: Array<{ academicYear: number }>, previous: number | null, now = new Date()) {
  const years = [...new Set([...index.map(row => row.academicYear), ...classes.map(row => row.academicYear)])];
  if (previous !== null && years.includes(previous)) return previous;
  return defaultTimetableYear(years, index.map(row => row.academicYear), now);
}

/** Replace one year's index rows with its full rows, keeping the index order (newest first). */
export function mergeTimetableYear<T extends Row>(rows: T[], year: number, full: T[]): T[] {
  const byId = new Map(full.map(row => [row.id, row]));
  const merged = rows.flatMap(row => row.academicYear !== year ? [row] : byId.has(row.id) ? [byId.get(row.id)!] : []);
  const known = new Set(rows.map(row => row.id));
  return [...full.filter(row => !known.has(row.id)), ...merged];
}

/** Full rows for one year; a year with no index rows needs no request. */
export async function fetchTimetableYear<T extends Row>(campusId: string | undefined, year: number, index: Array<{ academicYear: number }>, signal?: AbortSignal): Promise<T[]> {
  if (!index.some(row => row.academicYear === year)) return [];
  const res = await fetch(timetableListUrl(campusId, { academicYear: year }), { signal });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success || !Array.isArray(json.data)) throw new Error("timetable year load failed");
  return json.data as T[];
}
