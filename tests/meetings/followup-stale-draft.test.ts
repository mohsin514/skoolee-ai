import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1732: a follow-up save carries the draft token the teacher saw; a stale tab gets 409 and the first draft stays.
type Booking = { id: string; schoolId: string; teacherId: string; guardianUserId: string; studentId: string; status: string; version: number };
type FollowUp = { id: string; schoolId: string; bookingId: string; summary: string; sharedAt: Date | null; updatedAt: Date };
const bookings: Booking[] = [
  { id: "b-a", schoolId: "school-a", teacherId: "t-a", guardianUserId: "g-a", studentId: "s-a", status: "HELD", version: 2 },
  { id: "b-b", schoolId: "school-b", teacherId: "t-b", guardianUserId: "g-b", studentId: "s-b", status: "HELD", version: 2 },
];
let followUps: FollowUp[] = [];
let actions: Array<{ bookingId: string; text: string }> = [];
let tick = 1_000;
const tx = {
  $queryRaw: async () => [],
  meetingBooking: { findFirst: async ({ where }: { where: Partial<Booking> }) => bookings.find(b => b.id === where.id && b.schoolId === where.schoolId && b.teacherId === where.teacherId) ?? null },
  meetingFollowUp: {
    findUnique: async ({ where }: { where: { bookingId: string } }) => { const f = followUps.find(x => x.bookingId === where.bookingId); return f ? { ...f } : null; },
    upsert: async ({ where, create, update }: { where: { bookingId: string }; create: Omit<FollowUp, "id" | "sharedAt" | "updatedAt">; update: { summary: string } }) => {
      const f = followUps.find(x => x.bookingId === where.bookingId);
      if (f) Object.assign(f, update, { updatedAt: new Date(tick++) }); else followUps.push({ id: `f${followUps.length + 1}`, ...create, sharedAt: null, updatedAt: new Date(tick++) });
    },
  },
  meetingAction: {
    deleteMany: async ({ where }: { where: { bookingId: string } }) => { actions = actions.filter(a => a.bookingId !== where.bookingId); },
    create: async ({ data }: { data: { bookingId: string; text: string } }) => { actions.push({ bookingId: data.bookingId, text: data.text }); },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: {} } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: typeof tx) => unknown) => fn(tx) } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, canManageOperations: () => false } });

const teacher = (school: "a" | "b", role = "TEACHER") => ({ userId: `t-${school}`, schoolId: `school-${school}`, campusId: `campus-${school}1`, role }) as never;
const draft = (bookingId: string, label: string, knownFollowUpAt: unknown) => ({ bookingId, knownFollowUpAt, summary: `Summary ${label}`, actions: [{ text: `Action ${label}`, ownerRole: "FAMILY", dueDate: "2026-11-20" }] });
const reset = () => { followUps = []; actions = []; };
const conflict = (e: { status?: number }) => e.status === 409;

test("a first draft and a current-token revision both save", async () => {
  const { saveFollowUp } = await import("../../src/lib/meetings/service");
  reset();
  await saveFollowUp(teacher("a"), draft("b-a", "A", null));
  await saveFollowUp(teacher("a"), draft("b-a", "A2", followUps[0].updatedAt.toISOString()));
  assert.equal(followUps[0].summary, "Summary A2");
  assert.deepEqual(actions.map(a => a.text), ["Action A2"]);
});

test("a stale second tab gets 409 and keeps the first summary and actions", async () => {
  const { saveFollowUp } = await import("../../src/lib/meetings/service");
  reset();
  await saveFollowUp(teacher("a"), draft("b-a", "A", null));
  await assert.rejects(saveFollowUp(teacher("a"), draft("b-a", "B", null)), conflict);
  const seen = followUps[0].updatedAt.toISOString();
  await saveFollowUp(teacher("a"), draft("b-a", "A2", seen));
  await assert.rejects(saveFollowUp(teacher("a"), draft("b-a", "B", seen)), conflict);
  const { knownFollowUpAt: _omit, ...noToken } = draft("b-a", "B", null);
  await assert.rejects(saveFollowUp(teacher("a"), noToken), conflict);
  assert.equal(followUps[0].summary, "Summary A2");
  assert.deepEqual(actions.map(a => a.text), ["Action A2"]);
});

test("each school's drafts stay separate", async () => {
  const { saveFollowUp } = await import("../../src/lib/meetings/service");
  reset();
  await saveFollowUp(teacher("a"), draft("b-a", "A", null));
  await saveFollowUp(teacher("b"), draft("b-b", "B", null));
  await assert.rejects(saveFollowUp(teacher("b"), draft("b-a", "X", followUps[0].updatedAt.toISOString())), (e: { status?: number }) => e.status === 404);
  assert.deepEqual(followUps.map(f => f.summary), ["Summary A", "Summary B"]);
});

test("a non-staff role is refused with 403", async () => {
  const { saveFollowUp } = await import("../../src/lib/meetings/service");
  reset();
  await assert.rejects(saveFollowUp(teacher("a", "PARENT"), draft("b-a", "A", null)), (e: { status?: number }) => e.status === 403);
  assert.equal(followUps.length, 0);
});
