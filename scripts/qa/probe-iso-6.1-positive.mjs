// Regression guard for the ISO-6.1 fix: the LEGITIMATE same-campus path must
// still work. A fix that blocks the real workflow is worse than the bug.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
const BASE = "http://localhost:3000";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();
const T1 = fx.tenants.T1;
const north = T1.campuses.find((c) => c.name === "Alpha-North");
const admin = fx.personas["T1-CAMPUS_ADMIN"];
const teacherNorth = fx.personas["T1-TEACHER"];

const northClass = await prisma.class.findFirst({ where: { campusId: north.id }, select: { id: true } });
const tt = await prisma.timetable.upsert({
  where: { classId_academicYear_term: { classId: northClass.id, academicYear: 2026, term: "ANNUAL" } },
  create: { schoolId: T1.schoolId, campusId: north.id, classId: northClass.id, academicYear: 2026, term: "ANNUAL" },
  update: {},
});
const slot = await prisma.timetableSlot.upsert({
  where: { timetableId_dayOfWeek_periodNumber: { timetableId: tt.id, dayOfWeek: 1, periodNumber: 1 } },
  create: { schoolId: T1.schoolId, timetableId: tt.id, dayOfWeek: 1, periodNumber: 1,
            startTime: "08:00", endTime: "08:40", slotType: "CLASS", teacherId: null },
  update: { teacherId: null },
});
console.log(`same-campus write: North admin -> North slot ${slot.id}`);
const res = await fetch(`${BASE}/api/timetable/${tt.id}/suggestions`, {
  method: "POST",
  headers: { cookie: `skoolee_token=${admin.token}`, "content-type": "application/json" },
  body: JSON.stringify({ action: { type: "REASSIGN_TEACHER", slotId: slot.id, teacherId: teacherNorth.userId } }),
});
console.log(`HTTP ${res.status}`);
const after = await prisma.timetableSlot.findUnique({ where: { id: slot.id }, select: { teacherId: true } });
const ok = res.status === 200 && after?.teacherId === teacherNorth.userId;
console.log(ok
  ? "\nPASS — legitimate same-campus reassignment still works. No regression."
  : `\nFAIL — the fix broke the normal path. status=${res.status} teacherAfter=${after?.teacherId}`);
await prisma.timetableSlot.update({ where: { id: slot.id }, data: { teacherId: null } });
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
