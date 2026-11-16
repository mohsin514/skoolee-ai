import assert from "node:assert/strict";
import { test } from "node:test";
import { enrollmentImpact } from "../../src/lib/students/enrollment";

// SKAI-2110: a transition for an archived pupil is refused before any placement is read or changed.
const base = { id: "s1", classId: "c1", campusId: "main", consolidatedIntoId: null, archivedAt: null, status: "active" };
const tx = (pupil: object) => ({
  student: { findFirst: async () => pupil },
  studentEnrollment: { findFirst: async () => ({ id: "e1", classId: "c1", campusId: "main", startDate: new Date("2020-01-01") }) },
  class: { findFirst: async () => ({ id: "t", campus: {}, _count: { students: 0 } }) },
  attendance: { count: async () => 0 }, reportCard: { count: async () => 0 }, invoice: { count: async () => 0 },
}) as never;

test("archived pupil cannot be transferred", async () => {
  for (const pupil of [{ ...base, archivedAt: new Date(), status: "archived" }, { ...base, status: "archived" }]) {
    await assert.rejects(() => enrollmentImpact(tx(pupil), "s1", "e1", "t", new Date("2026-11-15"), true), /Restore or re-admit this pupil first/);
  }
});

test("active pupil is still allowed", async () => {
  const r = await enrollmentImpact(tx(base), "s1", "e1", "t", new Date("2026-11-15"), true);
  assert.equal(r.pupil.id, "s1");
});
