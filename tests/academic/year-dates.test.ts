import assert from "node:assert/strict";
import test from "node:test";
import { assertNoOverlap, assertYearCurrent, holidaysOutside, nextYearDraft, parseYearRange } from "../../src/lib/academic/year-dates";

const status = (fn: () => unknown) => { try { fn(); return 0; } catch (error) { return (error as { status?: number }).status; } };
const d = (day: string) => new Date(`${day}T00:00:00.000Z`);
const year = (id: string, start: string, end: string) => ({ id, label: id, startDate: d(start), endDate: d(end) });

test("SKAI-116 dates: real days, end after start, plausible length; create may omit both", () => {
  assert.deepEqual(parseYearRange({ startDate: "2026-08-01", endDate: "2027-06-30" }, true), { start: d("2026-08-01"), end: d("2027-06-30") });
  assert.equal(parseYearRange({}, false), null);
  assert.equal(status(() => parseYearRange({}, true)), 400);
  assert.equal(status(() => parseYearRange({ startDate: "2026-08-01" }, false)), 400);
  assert.equal(status(() => parseYearRange({ startDate: "2026-02-30", endDate: "2027-01-01" }, true)), 400);
  assert.equal(status(() => parseYearRange({ startDate: "2027-06-30", endDate: "2026-08-01" }, true)), 400);
  assert.equal(status(() => parseYearRange({ startDate: "2026-08-01", endDate: "2026-08-20" }, true)), 400);
  assert.equal(status(() => parseYearRange({ startDate: "2026-01-01", endDate: "2027-12-31" }, true)), 400);
});

test("SKAI-116 overlap: years on a campus cannot share a day; the edited year is excluded", () => {
  const years = [year("a", "2025-08-01", "2026-06-30"), { id: "u", label: "undated", startDate: null, endDate: null }];
  assert.equal(status(() => assertNoOverlap({ start: d("2026-06-30"), end: d("2027-06-01") }, years)), 409);
  assert.equal(status(() => assertNoOverlap({ start: d("2026-07-01"), end: d("2027-06-01") }, years)), 0);
  assert.equal(status(() => assertNoOverlap({ start: d("2025-09-01"), end: d("2026-05-01") }, years, "a")), 0);
});

test("SKAI-116 impact: holidays partly or fully outside the new range are reported", () => {
  const holidays = [
    { name: "Inside", fromDate: d("2026-12-24"), toDate: d("2026-12-26") },
    { name: "Straddles", fromDate: d("2027-06-28"), toDate: d("2027-07-05") },
    { name: "Before", fromDate: d("2026-07-10"), toDate: d("2026-07-12") },
  ];
  assert.deepEqual(holidaysOutside({ start: d("2026-08-01"), end: d("2027-06-30") }, holidays).map(h => h.name), ["Straddles", "Before"]);
});

test("SKAI-116 stale guard: a different saved updatedAt is a 409; omitting it stays compatible", () => {
  const saved = new Date("2026-10-30T10:00:00.000Z");
  assert.equal(status(() => assertYearCurrent(undefined, saved)), 0);
  assert.equal(status(() => assertYearCurrent(saved.toISOString(), saved)), 0);
  assert.equal(status(() => assertYearCurrent("2026-10-30T09:00:00.000Z", saved)), 409);
});

test("SKAI-116 rollover: next year starts the day after, same length, label bumped", () => {
  const next = nextYearDraft({ academicYear: 2026, label: "Session 2026-27", startDate: d("2026-08-01"), endDate: d("2027-06-30") });
  assert.equal(next.academicYear, 2027);
  assert.equal(next.label, "Session 2027-28");
  assert.equal(next.startDate?.toISOString().slice(0, 10), "2027-07-01");
  assert.equal(next.endDate?.toISOString().slice(0, 10), "2028-05-29");
  assert.equal(nextYearDraft({ academicYear: 2026, label: "Main", startDate: null, endDate: null }).label, "Main (2027)");
  assert.equal(nextYearDraft({ academicYear: 2026, label: "2026/2027", startDate: null, endDate: null }).label, "2027/2028");
});

test("SKAI-116 access: another campus, a teacher and the principal cannot change year dates (denied before any read)", async () => {
  const { writeAcademicCycle } = await import("../../src/lib/school-ai/school-operations-cycle-write");
  const user = (role: string, campusId: string) => ({ userId: "u1", schoolId: "school-a", campusId, role, fullName: "QA" }) as never;
  const body = { action: "update-dates", cycleId: "c1", startDate: "2026-08-01", endDate: "2027-06-30" };
  for (const actor of [user("ADMIN", "campus-b"), user("TEACHER", "campus-a"), user("PRINCIPAL", "campus-a")]) {
    await assert.rejects(writeAcademicCycle(actor, "campus-a", body), (error: { status?: number }) => error.status === 403);
  }
});
