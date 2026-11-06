import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-623: "today" for check-ins is the school's calendar day, not the UTC day. At 01:30 in Karachi
// (20:30 UTC the evening before) a same-day check-in must be accepted and a next check-in "tomorrow"
// in school time must still count as the future.
mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-06T20:30:00.000Z") });
mock.module("@/lib/datetime", { namedExports: { schoolToday: async () => "2026-11-07" } });
mock.module("@/lib/db/prisma", { namedExports: { prisma: {} } });
const REACHED = new Error("reached the transaction");
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => { throw REACHED; } } });

const user = { userId: "t", schoolId: "school-a", campusId: "campus-a", role: "TEACHER" } as never;
const checkIn = { version: 2, dueOn: "2026-11-07", delivered: true, minutes: 10, participation: "FULL", adjustment: null, pupilFeedback: null, nextCheckInDate: "2026-11-14" };

test("a check-in dated the school's today is accepted while UTC is still on the day before", async () => {
  const { recordCheckIn } = await import("../../src/lib/learning/actions");
  await assert.rejects(() => recordCheckIn(user, "plan-1", checkIn), (error: unknown) => error === REACHED);
});

test("a check-in after the school's today is still refused", async () => {
  const { recordCheckIn } = await import("../../src/lib/learning/actions");
  await assert.rejects(() => recordCheckIn(user, "plan-1", { ...checkIn, dueOn: "2026-11-08" }), { status: 400, message: "Record a check-in on or after the day it happened" });
});

test("rescheduling to the school's today is not the future", async () => {
  const { rescheduleCheckIn } = await import("../../src/lib/learning/actions");
  await assert.rejects(() => rescheduleCheckIn(user, "plan-1", { version: 2, nextCheckInDate: "2026-11-07", reason: "QA synthetic reschedule" }), { status: 400, message: "Choose a future date" });
});
