import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import { crossCampusSummary, type CrossCampusDb } from "../../src/lib/dashboard/cross-campus-summary";

// SKAI-824: owner roll-up of collections, overdue fees and attendance exceptions per campus.
// Two schools, two campuses: every query carries the caller's school and, when narrowed, campus.
const now = new Date("2026-11-06T09:00:00Z");
const rows = {
  campuses: [
    { id: "c1", schoolId: "s1", name: "North" }, { id: "c2", schoolId: "s1", name: "South" },
    { id: "x1", schoolId: "s2", name: "Other school" },
  ],
  payments: [
    { schoolId: "s1", campusId: "c1", amount: 500, paidAt: new Date("2026-11-02") },
    { schoolId: "s1", campusId: "c2", amount: 300, paidAt: new Date("2026-11-03") },
    { schoolId: "s1", campusId: "c2", amount: 999, paidAt: new Date("2026-09-01") },
    { schoolId: "s2", campusId: "x1", amount: 7000, paidAt: new Date("2026-11-02") },
  ],
  invoices: [
    { schoolId: "s1", campusId: "c1", balanceDue: 200, dueDate: new Date("2026-10-01"), status: "PARTIAL" },
    { schoolId: "s1", campusId: "c1", balanceDue: 100, dueDate: new Date("2026-12-01"), status: "PENDING" },
    { schoolId: "s1", campusId: "c2", balanceDue: 50, dueDate: new Date("2026-10-15"), status: "OVERDUE" },
    { schoolId: "s1", campusId: "c2", balanceDue: 80, dueDate: new Date("2026-10-15"), status: "CANCELLED" },
    { schoolId: "s2", campusId: "x1", balanceDue: 900, dueDate: new Date("2026-10-01"), status: "OVERDUE" },
  ],
  attendance: [
    { schoolId: "s1", campusId: "c1", status: "ABSENT", date: new Date("2026-11-06") },
    { schoolId: "s1", campusId: "c1", status: "PRESENT", date: new Date("2026-11-06") },
    { schoolId: "s1", campusId: "c2", status: "LATE", date: new Date("2026-11-06") },
    { schoolId: "s1", campusId: "c2", status: "ABSENT", date: new Date("2026-11-05") },
    { schoolId: "s2", campusId: "x1", status: "ABSENT", date: new Date("2026-11-06") },
  ],
};
type W = { schoolId: string; campusId?: string };
const match = (r: W, w: W) => r.schoolId === w.schoolId && (!w.campusId || r.campusId === w.campusId);
const db: CrossCampusDb = {
  campuses: async (w) => rows.campuses.filter((c) => c.schoolId === w.schoolId && (!w.campusId || c.id === w.campusId)),
  payments: async (w, since) => rows.payments.filter((p) => match(p, w) && p.paidAt >= since),
  openInvoices: async (w) => rows.invoices.filter((i) => match(i, w) && i.status !== "CANCELLED" && i.status !== "PAID" && i.balanceDue > 0),
  attendance: async (w, day) => rows.attendance.filter((a) => match(a, w) && a.date.toISOString().slice(0, 10) === day.toISOString().slice(0, 10)),
};
const user = (role: AuthUser["role"], extra: Partial<AuthUser> = {}): AuthUser => ({ userId: "u", schoolId: "s1", role, email: "u@example.invalid", campusId: null, ...extra } as AuthUser);

test("owner sees every campus of their own school and nothing from another school", async () => {
  const out = await crossCampusSummary(user("SUPER_ADMIN"), { now, db });
  assert.deepEqual(out.campuses.map((c) => c.campusId), ["c1", "c2"]);
  const [north, south] = out.campuses;
  assert.deepEqual({ ...north }, { campusId: "c1", name: "North", collected: 500, overdueCount: 1, overdueAmount: 200, attendanceExceptions: 1 });
  assert.deepEqual({ ...south }, { campusId: "c2", name: "South", collected: 300, overdueCount: 1, overdueAmount: 50, attendanceExceptions: 1 });
  assert.deepEqual(out.totals, { collected: 800, overdueCount: 2, overdueAmount: 250, attendanceExceptions: 2 });
});

test("owner of the second school sees only that school", async () => {
  const out = await crossCampusSummary(user("SUPER_ADMIN", { schoolId: "s2" }), { now, db });
  assert.deepEqual(out.totals, { collected: 7000, overdueCount: 1, overdueAmount: 900, attendanceExceptions: 1 });
});

test("an owner narrowed to one campus sees only that campus", async () => {
  const out = await crossCampusSummary(user("SUPER_ADMIN", { activeCampusId: "c2" }), { now, db });
  assert.deepEqual(out.campuses.map((c) => c.campusId), ["c2"]);
  assert.equal(out.totals.collected, 300);
});

test("campus-bound and family roles are denied", async () => {
  for (const role of ["PRINCIPAL", "CAMPUS_ADMIN", "TEACHER", "PARENT", "STUDENT"] as const) {
    await assert.rejects(crossCampusSummary(user(role, { campusId: "c1" }), { now, db }), /cannot access/, role);
  }
});
