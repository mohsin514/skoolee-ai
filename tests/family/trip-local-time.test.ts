import { test } from "node:test";
import { strict as assert } from "node:assert";
import { instantFromLocal, toLocalInput } from "../../src/lib/family/trip-local-time";

// SKAI-1428: an unchanged trip time must survive a revision, whatever the device timezone.
const stored = "2026-11-01T09:00:00.000Z";

for (const zone of ["Asia/Karachi", "America/Los_Angeles"]) {
  test(`SKAI-1428: an unchanged departure keeps its stored instant in ${zone}`, () => {
    process.env.TZ = zone;
    const input = toLocalInput(stored);
    assert.equal(instantFromLocal(input, { input, iso: stored }), stored);
  });
}

test("SKAI-1428: an edited time is read as the local time the family sees", () => {
  process.env.TZ = "Asia/Karachi";
  const original = { input: toLocalInput(stored), iso: stored };
  assert.equal(instantFromLocal("2026-11-01T15:00", original), "2026-11-01T10:00:00.000Z");
});
