// SKAI-1257: offers count against a class's seats; over-offering is flagged; counts never cross schools or campuses.
import assert from "node:assert/strict";
import { test } from "node:test";
import { intakeSeats, seatSummary } from "../../src/lib/admissions/intake-seats";

type Row = Record<string, unknown>;
const classes: Row[] = [
  { id: "c1", schoolId: "school-a", campusId: "a1", capacity: 3 },
  { id: "c2", schoolId: "school-a", campusId: "a1", capacity: null },
  { id: "cb", schoolId: "school-b", campusId: "b1", capacity: 3 },
];
const students: Row[] = [
  { schoolId: "school-a", campusId: "a1", classId: "c1", archivedAt: null, status: "active" },
  { schoolId: "school-a", campusId: "a1", classId: "c1", archivedAt: new Date(), status: "active" },
  { schoolId: "school-a", campusId: "a1", classId: "c1", archivedAt: null, status: "left" },
  // Same class id written under another school or campus must never be counted.
  { schoolId: "school-b", campusId: "b1", classId: "c1", archivedAt: null, status: "active" },
  { schoolId: "school-a", campusId: "a2", classId: "c1", archivedAt: null, status: "active" },
];
const apps: Row[] = [
  { schoolId: "school-a", campusId: "a1", intakeClassId: "c1", status: "OFFERED" },
  { schoolId: "school-a", campusId: "a1", intakeClassId: "c1", status: "ACCEPTED" },
  { schoolId: "school-a", campusId: "a1", intakeClassId: "c1", status: "DECLINED" },
  { schoolId: "school-a", campusId: "a1", intakeClassId: "c1", status: "ENROLLED" },
  { schoolId: "school-b", campusId: "b1", intakeClassId: "c1", status: "OFFERED" },
];

const matches = (row: Row, where: Row) => Object.entries(where).every(([key, want]) => {
  if (want && typeof want === "object" && "in" in (want as Row)) return ((want as { in: unknown[] }).in).includes(row[key]);
  return row[key] === want;
});
const db = {
  class: { findFirst: async ({ where }: { where: Row }) => (classes.find(c => matches(c, where)) as { capacity: number | null } | undefined) ?? null },
  student: { count: async ({ where }: { where: Row }) => students.filter(s => matches(s, where)).length },
  admissionApplication: { count: async ({ where }: { where: Row }) => apps.filter(a => matches(a, where)).length },
};

test("enrolled pupils plus open offers and accepted places fill the seats", async () => {
  const seats = await intakeSeats(db, "school-a", "a1", "c1");
  assert.deepEqual(seats, { classId: "c1", capacity: 3, enrolled: 1, offered: 2, committed: 3, over: false });
});

test("one more offer than the seats is flagged as over-offered", () => {
  assert.equal(seatSummary("c1", 3, 1, 3).over, true);
  assert.equal(seatSummary("c1", 3, 0, 3).over, false);
});

test("a class with no capacity set is never reported as over-offered", async () => {
  const seats = await intakeSeats(db, "school-a", "a1", "c2");
  assert.equal(seats?.capacity, null);
  assert.equal(seats?.over, false);
});

test("another school's or campus's class is not found, so no seats leak", async () => {
  assert.equal(await intakeSeats(db, "school-b", "b1", "c1"), null);
  assert.equal(await intakeSeats(db, "school-a", "a2", "c1"), null);
  const other = await intakeSeats(db, "school-b", "b1", "cb");
  assert.deepEqual([other?.enrolled, other?.offered], [0, 0]);
});
