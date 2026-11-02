import assert from "node:assert/strict";
import { test } from "node:test";
import { clockTimeIn, dayLabelIn, previousDayKey, zonedDayKey } from "../../src/components/chat/message-time";

const ui = (key: string) => ({ Today: "Today", Yesterday: "Yesterday" } as Record<string, string>)[key] ?? key;
const KARACHI = "Asia/Karachi";
const LOS_ANGELES = "America/Los_Angeles";
const EN = "en-u-ca-gregory-nu-latn";
const AT = "2026-11-01T01:30:00Z";

test("the same instant is 2026-11-01 in Karachi and 2026-10-31 on a Los Angeles device", () => {
  assert.equal(zonedDayKey(new Date(AT), KARACHI), "2026-11-01");
  assert.equal(zonedDayKey(new Date(AT), LOS_ANGELES), "2026-10-31");
});

test("clock time is read in the school timezone: 06:30 Karachi, 18:30 Los Angeles", () => {
  assert.equal(clockTimeIn(AT, "en-GB", KARACHI), "06:30");
  assert.equal(clockTimeIn(AT, "en-GB", LOS_ANGELES), "18:30");
});

test("Today and Yesterday follow the school timezone at midnight", () => {
  // now: 2026-11-01 06:45 in Karachi (01:45Z); a message at 06:30 Karachi that morning is Today for the school.
  const now = new Date("2026-11-01T01:45:00Z");
  assert.equal(dayLabelIn(AT, { ui, tag: EN, timeZone: KARACHI, now }), "Today");
  // Labels are computed in the zone passed in: in Los Angeles the same instant is 31 Oct, which is today there.
  assert.equal(dayLabelIn(AT, { ui, tag: EN, timeZone: LOS_ANGELES, now }), "Today");
});

test("a message from the previous school day is Yesterday even across a device day change", () => {
  const now = new Date("2026-11-01T10:00:00Z"); // Karachi 15:00 on 1 Nov
  assert.equal(dayLabelIn("2026-10-31T20:00:00Z", { ui, tag: EN, timeZone: KARACHI, now }), "Today"); // 1 Nov 01:00 Karachi
  assert.equal(dayLabelIn("2026-10-31T17:00:00Z", { ui, tag: EN, timeZone: KARACHI, now }), "Yesterday"); // 31 Oct 22:00 Karachi
});

test("a message two school days ago is shown as a date in the school timezone", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  const label = dayLabelIn("2026-10-30T10:00:00Z", { ui, tag: EN, timeZone: KARACHI, now });
  assert.match(label, /30 October 2026|October 30, 2026/);
});

test("DST end in Los Angeles (2026-11-01 02:00 PDT) keeps the calendar day and the previous-day key correct", () => {
  // 01:30 PDT (08:30Z) and 01:30 PST (09:30Z) are both 1 Nov in Los Angeles.
  assert.equal(zonedDayKey(new Date("2026-11-01T08:30:00Z"), LOS_ANGELES), "2026-11-01");
  assert.equal(zonedDayKey(new Date("2026-11-01T09:30:00Z"), LOS_ANGELES), "2026-11-01");
  // Yesterday across the 25-hour day is still 31 October.
  const now = new Date("2026-11-01T12:00:00Z"); // 04:00 PST on 1 Nov
  assert.equal(dayLabelIn("2026-10-31T19:00:00Z", { ui, tag: EN, timeZone: LOS_ANGELES, now }), "Yesterday");
  assert.equal(previousDayKey("2026-11-01"), "2026-10-31");
  assert.equal(previousDayKey("2026-03-01"), "2026-02-28");
});

test("Karachi has no DST, so 24 hours always moves one calendar day", () => {
  assert.equal(zonedDayKey(new Date("2026-03-14T19:00:00Z"), KARACHI), "2026-03-15");
});
