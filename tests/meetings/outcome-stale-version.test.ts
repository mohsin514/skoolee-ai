import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1731: a meeting outcome carries the booking version the teacher saw; a stale tab gets 409 and changes nothing.
type Booking = { id: string; schoolId: string; teacherId: string; status: string; version: number; startsAt: Date };
let bookings: Booking[] = [];
const events: Array<{ schoolId: string; bookingId: string; version: number; action: string }> = [];
const tx = {
  $queryRaw: async () => [],
  meetingBooking: {
    findFirst: async ({ where }: { where: Partial<Booking> }) => { const b = bookings.find(x => x.id === where.id && x.schoolId === where.schoolId && x.teacherId === where.teacherId); return b ? { ...b } : null; },
    update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => { const b = bookings.find(x => x.id === where.id)!; b.status = data.status; b.version += 1; return b; },
  },
  meetingBookingEvent: { create: async ({ data }: { data: (typeof events)[number] }) => { events.push(data); return data; } },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: {} } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: typeof tx) => unknown) => fn(tx) } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, canManageOperations: () => false } });

const teacher = (school: "a" | "b", role = "TEACHER") => ({ userId: `t-${school}`, schoolId: `school-${school}`, campusId: `campus-${school}1`, role }) as never;
const past = new Date(Date.now() - 3_600_000);
const reset = () => { events.length = 0; bookings = [{ id: "b-a", schoolId: "school-a", teacherId: "t-a", status: "CONFIRMED", version: 1, startsAt: past }, { id: "b-b", schoolId: "school-b", teacherId: "t-b", status: "CONFIRMED", version: 1, startsAt: past }]; };

test("an outcome with the current version is recorded once", async () => {
  const { recordOutcome } = await import("../../src/lib/meetings/service");
  reset();
  assert.deepEqual(await recordOutcome(teacher("a"), { bookingId: "b-a", outcome: "HELD", knownVersion: 1 }), { status: "HELD" });
  assert.equal(bookings[0].version, 2);
  assert.deepEqual(events.map(e => [e.version, e.action]), [[2, "HELD"]]);
});

test("a stale second tab gets 409 and the first outcome stands", async () => {
  const { recordOutcome } = await import("../../src/lib/meetings/service");
  reset();
  await recordOutcome(teacher("a"), { bookingId: "b-a", outcome: "HELD", knownVersion: 1 });
  await assert.rejects(recordOutcome(teacher("a"), { bookingId: "b-a", outcome: "NOT_HELD", knownVersion: 1 }), (e: { status?: number }) => e.status === 409);
  await assert.rejects(recordOutcome(teacher("a"), { bookingId: "b-a", outcome: "NOT_HELD" }), (e: { status?: number }) => e.status === 409);
  assert.equal(bookings[0].status, "HELD");
  assert.equal(events.length, 1);
});

test("each school's bookings stay separate", async () => {
  const { recordOutcome } = await import("../../src/lib/meetings/service");
  reset();
  await recordOutcome(teacher("b"), { bookingId: "b-b", outcome: "NOT_HELD", knownVersion: 1 });
  await assert.rejects(recordOutcome(teacher("b"), { bookingId: "b-a", outcome: "NOT_HELD", knownVersion: 1 }), (e: { status?: number }) => e.status === 404);
  assert.deepEqual(bookings.map(b => b.status), ["CONFIRMED", "NOT_HELD"]);
});

test("a non-staff role is refused with 403", async () => {
  const { recordOutcome } = await import("../../src/lib/meetings/service");
  reset();
  await assert.rejects(recordOutcome(teacher("a", "PARENT"), { bookingId: "b-a", outcome: "HELD", knownVersion: 1 }), (e: { status?: number }) => e.status === 403);
  assert.equal(bookings[0].status, "CONFIRMED");
});
