import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paymentAcademicYear } from "@/lib/fees/payment-year";
import { planCarryRepair, repairMisdatedCredits, repairMarker } from "@/lib/fees/repair-carry-year";

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


describe("misdated overpayment repair (SKAI-1543)", () => {
  const src = { paymentId: "p1", studentId: "s1", currency: "PKR", credit: 2000, recordedYear: 2027, correctYear: 2026 };
  const wrong = { id: "c1", studentId: "s1", toAcademicYear: 2028, balance: -2000, currency: "PKR", note: "Auto credit from overpayment" };

  it("moves a New Year credit from 2027->2028 to 2026->2027", () => {
    const [step] = planCarryRepair([src], [wrong]);
    assert.deepEqual(step, { kind: "move", paymentId: "p1", studentId: "s1", credit: 2000, currency: "PKR", fromToYear: 2028, toToYear: 2027 });
  });

  it("is a no-op on replay once the target row carries the marker", () => {
    const repaired = { id: "c2", studentId: "s1", toAcademicYear: 2027, balance: -2000, currency: "PKR", note: repairMarker("p1") };
    assert.deepEqual(planCarryRepair([src], [{ ...wrong, balance: 0 }, repaired]), []);
  });

  it("skips credit that was already consumed and credit in another currency", () => {
    assert.equal(planCarryRepair([src], [{ ...wrong, balance: -500 }])[0].kind, "skip");
    assert.equal(planCarryRepair([src], [{ ...wrong, currency: "SAR" }])[0].kind, "skip");
  });

  it("leaves correctly dated credits alone", () => {
    assert.deepEqual(planCarryRepair([{ ...src, recordedYear: 2026 }], [wrong]), []);
  });

  function fakeDb() {
    const payments = [
      { id: "pA", schoolId: "school-a", studentId: "s1", currency: "PKR", amount: 12000, reversalOfId: null, paymentDate: new Date(2027, 0, 15, 12), invoice: { campusId: "camp-a", enrollmentId: "eA" } },
      { id: "pR", schoolId: "school-a", studentId: "s2", currency: "PKR", amount: 12000, reversalOfId: null, paymentDate: new Date(2027, 0, 15, 12), invoice: { campusId: "camp-a", enrollmentId: "eA" } },
      { id: "rev", schoolId: "school-a", studentId: "s2", currency: "PKR", amount: -12000, reversalOfId: "pR", paymentDate: new Date(2027, 0, 16, 12), invoice: { campusId: "camp-a", enrollmentId: "eA" } },
      { id: "pB", schoolId: "school-b", studentId: "s9", currency: "PKR", amount: 12000, reversalOfId: null, paymentDate: new Date(2027, 0, 15, 12), invoice: { campusId: "camp-b", enrollmentId: "eB" } },
    ];
    const allocations = [
      { schoolId: "school-a", paymentId: "pA", credit: 2000 },
      { schoolId: "school-a", paymentId: "pR", credit: 2000 },
      { schoolId: "school-a", paymentId: "rev", credit: -2000 },
      { schoolId: "school-b", paymentId: "pB", credit: 2000 },
    ];
    const carries = [
      { id: "cA", schoolId: "school-a", campusId: "camp-a", studentId: "s1", toAcademicYear: 2028, balance: -2000, currency: "PKR", note: null as string | null },
      { id: "cB", schoolId: "school-b", campusId: "camp-b", studentId: "s9", toAcademicYear: 2028, balance: -2000, currency: "PKR", note: null as string | null },
    ];
    type W = Record<string, unknown>;
    const match = (row: W, where: W) => Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "in" in (v as W)) return ((v as { in: unknown[] }).in).includes(row[k]);
      if (v && typeof v === "object") return true; // amount/createdAt ranges
      return row[k] === v;
    });
    const tx = {
      payment: { findMany: async ({ where }: { where: W }) => payments.filter(p => match(p, where) && (!("amount" in where) || p.amount > 0)) },
      paymentAllocation: { findMany: async ({ where }: { where: W }) => allocations.filter(a => match(a, where)) },
      feeCarryForward: {
        findMany: async ({ where }: { where: W }) => carries.filter(c => match(c, where)),
        findFirst: async ({ where }: { where: W }) => carries.find(c => match(c, where)) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: W }) => Object.assign(carries.find(c => c.id === where.id)!, data),
        create: async ({ data }: { data: (typeof carries)[number] }) => { carries.push({ ...data, id: `new-${carries.length}` }); return data; },
      },
      studentEnrollment: { findUnique: async () => ({ academicYear: 2026 }) },
      academicCycle: { findFirst: async () => null },
    };
    return { tx: tx as never, carries };
  }

  it("repairs only the requested school, nets reversals, and is idempotent", async () => {
    const { tx, carries } = fakeDb();
    const steps = await repairMisdatedCredits(tx, { schoolId: "school-a", before: new Date("2027-06-01"), apply: true });
    assert.deepEqual(steps.map(s => s.paymentId), ["pA"]);
    assert.equal(carries.find(c => c.id === "cA")!.balance, 0);
    const moved = carries.find(c => c.schoolId === "school-a" && c.toAcademicYear === 2027)!;
    assert.equal(moved.balance, -2000);
    assert.equal(carries.find(c => c.id === "cB")!.balance, -2000, "school-b untouched");
    assert.deepEqual(await repairMisdatedCredits(tx, { schoolId: "school-a", before: new Date("2027-06-01"), apply: true }), []);
  });
});
