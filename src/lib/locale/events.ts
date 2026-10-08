import { dateOnly } from "./package";

/** Returns zero candidates for a DST gap and two for a repeated wall time.
 * Callers must present ambiguity, never silently move an existing school event. */
export function wallTimeInstants(date: string, time: string, timezone: string): string[] {
 dateOnly(date);
 if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("time");
 const target = `${date}T${time}:00`;
 const naive = Date.parse(`${target}Z`);
 const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
 function local(ms: number) { const p = Object.fromEntries(formatter.formatToParts(new Date(ms)).map(({type,value}) => [type,value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`; }
 const offsets = new Set<number>();
 for (let h = -48; h <= 48; h += 6) { const ms = naive + h * 3600000; offsets.add(Date.parse(`${local(ms)}Z`) - ms); }
 return [...offsets].map((offset) => naive - offset).filter((ms) => local(ms) === target).sort().map((ms) => new Date(ms).toISOString());
}
