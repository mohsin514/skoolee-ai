/** Calendar and lesson comparisons use the institution's timezone, never the browser's. */
export function schoolClock(now: Date, timezone: string) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return { day, minutes: value('hour') * 60 + value('minute') };
}
