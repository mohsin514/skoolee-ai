import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1406: a reminder whose delivery fails must stay due for the next cron run.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
const updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
let failDelivery = false;
const delivered: string[] = [];

mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: { meetingBooking: { updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => { updates.push(args); return { count: 1 }; } } },
  },
});
mock.module(src("lib/notifications/in-app.ts"), {
  namedExports: {
    deliverNotification: async (event: string) => { if (failDelivery) throw new Error("provider down"); delivered.push(event); },
  },
});
mock.module(src("lib/meetings/service.ts"), { namedExports: { findConflicts: async () => [] } });

const booking = { id: "b1", schoolId: "s1", campusId: "c1", guardianUserId: "g1", teacherId: "t1" };

test("a successful reminder is marked and both parties are notified", async () => {
  const { remind } = await import(src("lib/meetings/notify.ts"));
  updates.length = 0; delivered.length = 0; failDelivery = false;
  assert.equal(await remind(booking), true);
  assert.deepEqual(delivered, ["MEETING_REMINDER_FAMILY", "MEETING_REMINDER"]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].data.remindedAt instanceof Date, true);
});

test("a failed delivery releases the claim so the reminder is retried", async () => {
  const { remind } = await import(src("lib/meetings/notify.ts"));
  updates.length = 0; failDelivery = true;
  assert.equal(await remind(booking), false);
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[1].data, { remindedAt: null });
});
