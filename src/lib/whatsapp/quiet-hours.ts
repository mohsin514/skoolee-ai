import { prisma } from "@/lib/db/prisma";
import { getLocalePackage } from "@/lib/locale/store";

// SKAI-987 (INT-WA-03): a guardian WhatsApp message is held, not dropped, during the school's quiet hours
// (the messaging rules in chat settings, "HH:mm" in the campus time zone). A message marked urgent by staff
// is the school's exception and goes out at once.
export type QuietHours = { enabled: boolean; start: string; end: string };

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : NaN; };

/** Milliseconds until quiet hours end at `now` in `timeZone`; 0 outside quiet hours or when they are off. */
export function quietHoursDelayMs(now: Date, rule: QuietHours, timeZone: string): number {
  if (!rule.enabled) return 0;
  const start = minutes(rule.start), end = minutes(rule.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return 0;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now).map(part => [part.type, part.value]));
  const current = Number(parts.hour) * 60 + Number(parts.minute);
  const inside = start < end ? current >= start && current < end : current >= start || current < end;
  if (!inside) return 0;
  const waitMinutes = (end - current + 24 * 60) % (24 * 60);
  return Math.max(1000, (waitMinutes * 60 - Number(parts.second)) * 1000);
}

/** The hold for one guardian WhatsApp message, read from the school's rules and the campus locale. */
export async function whatsappQuietHoursDelayMs(input: { schoolId: string; campusId?: string | null; urgent?: boolean }, now = new Date()): Promise<number> {
  if (input.urgent) return 0;
  const setting = await prisma.chatSetting.findUnique({ where: { schoolId: input.schoolId }, select: { quietHoursEnabled: true, quietHoursStart: true, quietHoursEnd: true } });
  if (!setting?.quietHoursEnabled) return 0;
  const locale = await getLocalePackage(input.schoolId, input.campusId ?? null, now);
  return quietHoursDelayMs(now, { enabled: true, start: setting.quietHoursStart, end: setting.quietHoursEnd }, locale.timezone);
}
