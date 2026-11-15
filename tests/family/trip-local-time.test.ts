import { test } from "node:test";
import { strict as assert } from "node:assert";
import { instantFromLocal, toLocalInput } from "../../src/lib/family/trip-local-time";

// SKAI-1428: trip times are edited on the campus clock, so an unchanged time survives a revision
// whatever the staff device timezone, and the campus clock never depends on the device.
const campuses = ["Asia/Karachi", "America/Los_Angeles"];
const devices = ["Asia/Karachi", "America/Los_Angeles", "UTC"];
const stored = { departAt: "2026-11-01T09:00:00.000Z", returnAt: "2026-11-03T12:30:00.000Z", respondBy: "2026-10-28T18:00:00.000Z" };

for (const device of devices) {
  for (const campus of campuses) {
    test(`SKAI-1428: campus ${campus} on a ${device} device keeps all three unchanged instants`, () => {
      process.env.TZ = device;
      for (const [key, iso] of Object.entries(stored)) {
        const input = toLocalInput(iso, campus);
        assert.equal(instantFromLocal(input, campus, { input, iso }), iso, key);
      }
    });
  }
}

test("SKAI-1428: the prefill shows the campus clock, not the device clock", () => {
  process.env.TZ = "America/Los_Angeles";
  assert.equal(toLocalInput(stored.departAt, "Asia/Karachi"), "2026-11-01T14:00");
  process.env.TZ = "Asia/Karachi";
  // 09:00Z is the moment US daylight time ends on 1 Nov 2026, so Los Angeles shows 01:00 PST.
  assert.equal(toLocalInput(stored.departAt, "America/Los_Angeles"), "2026-11-01T01:00");
});

test("SKAI-1428: an edited time is read as campus wall-clock time on any device", () => {
  for (const device of devices) {
    process.env.TZ = device;
    const original = { input: toLocalInput(stored.departAt, "Asia/Karachi"), iso: stored.departAt };
    assert.equal(instantFromLocal("2026-11-01T15:00", "Asia/Karachi", original), "2026-11-01T10:00:00.000Z");
  }
});

test("SKAI-1428: a Los Angeles campus edit is read on its own clock", () => {
  process.env.TZ = "Asia/Karachi";
  assert.equal(instantFromLocal("2026-11-01T02:00", "America/Los_Angeles"), "2026-11-01T10:00:00.000Z");
});

test("SKAI-1428: an invalid edited time is rejected", () => {
  assert.throws(() => instantFromLocal("", "Asia/Karachi"), RangeError);
});
