import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2112: impossible calendar dates are refused with 400 before they reach Prisma or roll over.
const db = {};
mock.module("@/lib/db/prisma", { namedExports: { prisma: db } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } } } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async () => {} } });
mock.module("@/lib/datetime", { namedExports: { schoolToday: async () => "2026-11-05" } });

const U = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
const lead = { userId: "lead-1", schoolId: "school-a", role: "PRINCIPAL", campusId: null } as never;
const status = (e: unknown) => (e as { status?: number }).status;
const base = { frameworkId: U(3), criterionIds: [U(4)], title: "Improve reading", ownerId: U(6), dueDate: "2026-12-01", expectedMeasure: "Reading age up" };

test("isRealDay accepts real dates and rejects impossible or out-of-range ones", async () => {
  const { isRealDay } = await import("../../src/lib/improvement/service");
  for (const ok of ["2026-02-28", "2028-02-29", "2026-12-31"]) assert.equal(isRealDay(ok), true, ok);
  for (const bad of ["2026-13-45", "2026-00-00", "2026-02-30", "2026-99-99", "2027-02-29", "0001-01-01", "9999-12-31"]) assert.equal(isRealDay(bad), false, bad);
});

test("createAction answers 400 for a bad due date or milestone date", async () => {
  const { createAction } = await import("../../src/lib/improvement/service");
  for (const dueDate of ["2026-13-45", "2026-00-00", "2026-02-30"]) await assert.rejects(createAction(lead, { ...base, dueDate }), (e) => status(e) === 400);
  await assert.rejects(createAction(lead, { ...base, milestones: [{ label: "m1", date: "2026-99-99" }] }), (e) => status(e) === 400);
});

test("addEvidence answers 400 for a bad review-by date", async () => {
  const { addEvidence } = await import("../../src/lib/improvement/service");
  await assert.rejects(addEvidence(lead, { frameworkId: U(3), criterionIds: [U(4)], sourceType: "DOCUMENT", title: "Doc", note: "A note long enough", stance: "SUPPORTS", reviewBy: "2026-13-45" }), (e) => status(e) === 400);
});
