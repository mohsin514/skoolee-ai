import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedDays, unmarkedPupilDays } from "@/lib/attendance/period-unmarked";

// SKAI-1537: Mon 2026-10-19 .. Fri 2026-10-23.
const mon = new Date("2026-10-19T00:00:00.000Z"), fri = new Date("2026-10-23T23:59:59.999Z");

test("2 pupils marked only on Monday leaves 8 unmarked pupil-days", () => {
  const days = expectedDays(mon, fri, ["2026-10-19"]);
  assert.equal(days.size, 5);
  assert.equal(unmarkedPupilDays(2, days, [{ studentId: "a", date: "2026-10-19" }, { studentId: "b", date: "2026-10-19" }]), 8);
});

test("a fully marked week has none unmarked, and duplicates do not over-count", () => {
  const days = expectedDays(mon, fri, []);
  const recs = [...days].flatMap(d => [{ studentId: "a", date: d }, { studentId: "a", date: d }]);
  assert.equal(unmarkedPupilDays(1, days, recs), 0);
});

test("weekends are skipped unless the campus actually marked them", () => {
  const sun = new Date("2026-10-25T23:59:59.999Z");
  assert.equal(expectedDays(mon, sun, []).size, 5);
  assert.equal(expectedDays(mon, sun, ["2026-10-24"]).size, 6);
});

test("today: one day, unmarked pupils counted", () => {
  const days = expectedDays(mon, new Date("2026-10-19T23:59:59.999Z"), []);
  assert.equal(unmarkedPupilDays(3, days, [{ studentId: "a", date: "2026-10-19" }]), 2);
});
