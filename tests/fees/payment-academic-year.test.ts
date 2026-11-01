import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paymentAcademicYear } from "@/lib/fees/payment-year";

type Cycle = { campusId: string; academicYear: number; status: string };

function fakeTx(opts: { enrollments?: Record<string, number>; cycles?: Cycle[] }) {
  const enrollments = opts.enrollments ?? {};
  const cycles = opts.cycles ?? [];
  return {
    studentEnrollment: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        enrollments[where.id] === undefined ? null : { academicYear: enrollments[where.id] },
    },
    academicCycle: {
      findFirst: async ({ where }: { where: { campusId: string; status: string } }) =>
        cycles.find(c => c.campusId === where.campusId && c.status === where.status) ?? null,
    },
  } as never;
}

describe("paymentAcademicYear (SKAI-1543)", () => {
  it("uses the enrollment year, not the calendar year, for a New Year payment", async () => {
    const tx = fakeTx({ enrollments: { e1: 2026 } });
    const year = await paymentAcademicYear(tx, { campusId: "c1", enrollmentId: "e1" }, new Date("2027-01-05T09:00:00Z"));
    assert.equal(year, 2026);
  });

  it("uses the active cycle when the cycle starts before the calendar year ends", async () => {
    const tx = fakeTx({ cycles: [{ campusId: "c1", academicYear: 2027, status: "ACTIVE" }] });
    const year = await paymentAcademicYear(tx, { campusId: "c1", enrollmentId: null }, new Date("2026-09-10T00:00:00Z"));
    assert.equal(year, 2027);
  });

  it("does not let another campus's cycle decide the year", async () => {
    const tx = fakeTx({ cycles: [{ campusId: "c2", academicYear: 2030, status: "ACTIVE" }] });
    const year = await paymentAcademicYear(tx, { campusId: "c1", enrollmentId: null }, new Date("2026-03-01T00:00:00Z"));
    assert.equal(year, 2026);
  });

  it("ignores cycles that are not ACTIVE", async () => {
    const tx = fakeTx({ cycles: [{ campusId: "c1", academicYear: 2028, status: "DRAFT" }] });
    const year = await paymentAcademicYear(tx, { campusId: "c1", enrollmentId: null }, new Date("2027-02-01T00:00:00Z"));
    assert.equal(year, 2027);
  });

  it("falls back to the payment's calendar year when nothing else resolves", async () => {
    const tx = fakeTx({});
    const year = await paymentAcademicYear(tx, { campusId: "c1", enrollmentId: "missing" }, new Date(2027, 11, 31, 12));
    assert.equal(year, 2027);
  });
});
