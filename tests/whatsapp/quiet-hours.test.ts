import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { quietHoursDelayMs } from "../../src/lib/whatsapp/quiet-hours";

// SKAI-987 (INT-WA-03): quiet hours are read in the campus time zone and hold, never drop, a WhatsApp message.
const overnight = { enabled: true, start: "20:00", end: "07:00" };
const at = (iso: string) => new Date(iso);

test("SKAI-987: inside overnight quiet hours the message waits until they end, in campus time", () => {
  // 21:30 in Karachi (UTC+5) → wait 9h30m until 07:00.
  assert.equal(quietHoursDelayMs(at("2026-11-02T16:30:00Z"), overnight, "Asia/Karachi"), 9.5 * 3_600_000);
  // 06:59 in Karachi → one minute.
  assert.equal(quietHoursDelayMs(at("2026-11-02T01:59:00Z"), overnight, "Asia/Karachi"), 60_000);
});

test("SKAI-987: outside quiet hours, when off, or with a malformed window, it sends now", () => {
  assert.equal(quietHoursDelayMs(at("2026-11-02T07:00:00Z"), overnight, "Asia/Karachi"), 0); // 12:00 local
  assert.equal(quietHoursDelayMs(at("2026-11-02T02:00:00Z"), overnight, "Asia/Karachi"), 0); // 07:00 local, end is exclusive
  assert.equal(quietHoursDelayMs(at("2026-11-02T16:30:00Z"), { ...overnight, enabled: false }, "Asia/Karachi"), 0);
  assert.equal(quietHoursDelayMs(at("2026-11-02T16:30:00Z"), { enabled: true, start: "xx", end: "07:00" }, "Asia/Karachi"), 0);
});

test("SKAI-987: the same instant is quiet on one campus and not on another", () => {
  const instant = at("2026-11-02T17:30:00Z"); // 22:30 Karachi, 21:30 Dubai, 20:30 Riyadh... and 17:30 UTC
  assert.ok(quietHoursDelayMs(instant, overnight, "Asia/Karachi") > 0);
  assert.equal(quietHoursDelayMs(instant, overnight, "UTC"), 0);
});

test("SKAI-987: a same-day window (13:00–14:00) is handled", () => {
  assert.equal(quietHoursDelayMs(at("2026-11-02T13:15:00Z"), { enabled: true, start: "13:00", end: "14:00" }, "UTC"), 45 * 60_000);
});

test("SKAI-987: the worker holds non-urgent WhatsApp sends and lets urgent ones through", () => {
  const worker = readFileSync("src/workers/notification-worker.ts", "utf8");
  assert.match(worker, /if \(data\.channel === "WHATSAPP"\) await holdForQuietHours\(job, token, \{ schoolId: data\.schoolId, campusId: data\.campusId, urgent: data\.metadata\?\.urgent === true \}\);/);
  assert.match(worker, /if \(legacyData\.type === "WHATSAPP"\) await holdForQuietHours/);
  assert.match(worker, /await job\.moveToDelayed\(Date\.now\(\) \+ delay, token\);\s*throw new DelayedError\(\);/);
  const quiet = readFileSync("src/lib/whatsapp/quiet-hours.ts", "utf8");
  assert.match(quiet, /if \(input\.urgent\) return 0;/);
});
