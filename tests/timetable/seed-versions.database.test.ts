import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { recordSeedTimetableVersions } from "../../prisma/seed-timetable-versions";
import { versionsFor, slotsOf } from "../../src/lib/timetable/versions";

// SKAI-2078: a seeded PUBLISHED board must have a version in force, or teachers, learners and families see
// "No published timetable" while leaders see "Published".
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw new Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const raw = new PrismaClient(), schoolId = `seed-tt-${randomUUID()}`, campusId = randomUUID();
const ids = { published: randomUUID(), draft: randomUUID(), klass: randomUUID(), klass2: randomUUID() };
const today = new Date().toISOString().slice(0, 10);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic seed school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Seed", regId: campusId, city: "Synthetic" } });
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE", startDate: new Date("2026-01-01") } });
  for (const [id, name] of [[ids.klass, "A"], [ids.klass2, "B"]]) await raw.class.create({ data: { id, schoolId, campusId, name, academicYear: 2026 } });
  await raw.timetable.create({ data: { id: ids.published, schoolId, campusId, classId: ids.klass, academicYear: 2026, status: "PUBLISHED", publishedAt: new Date() } });
  await raw.timetable.create({ data: { id: ids.draft, schoolId, campusId, classId: ids.klass2, academicYear: 2026, status: "DRAFT" } });
  await raw.timetableSlot.create({ data: { schoolId, timetableId: ids.published, dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40", roomNumber: "R1" } });
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); });

test("a seeded published board gets version 1 in force today; drafts get none; re-running adds nothing", async () => {
  assert.equal((await versionsFor(ids.published, today, raw as never)).inForce, null, "no version before the seed step");
  await recordSeedTimetableVersions(raw, campusId);
  await recordSeedTimetableVersions(raw, campusId);
  const { inForce } = await versionsFor(ids.published, today, raw as never);
  assert.equal(inForce?.version, 1);
  assert.deepEqual(slotsOf(inForce).map((s) => [s.dayOfWeek, s.periodNumber, s.roomNumber]), [[1, 1, "R1"]]);
  assert.equal(await raw.timetableVersion.count({ where: { timetableId: ids.published } }), 1);
  assert.equal(await raw.timetableVersion.count({ where: { timetableId: ids.draft } }), 0);
});
