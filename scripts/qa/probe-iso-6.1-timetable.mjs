// ISO-6.1 probe: can a CAMPUS_ADMIN of Alpha-North write to Alpha-South's
// timetable? applySuggestion() looks up the slot by { id, timetableId } with no
// campusId, and the Prisma guard only scopes by school_id — so the campus
// boundary has nothing enforcing it. This proves or disproves that.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();

const T1 = fx.tenants.T1;
const north = T1.campuses.find((c) => c.name === "Alpha-North");
const south = T1.campuses.find((c) => c.name === "Alpha-South");
const admin = fx.personas["T1-CAMPUS_ADMIN"];        // campusId = Alpha-North
const teacherNorth = fx.personas["T1-TEACHER"];      // campusId = Alpha-North

console.log(`attacker : T1-CAMPUS_ADMIN (campus=${admin.campusId === north.id ? "Alpha-North" : admin.campusId})`);
console.log(`target   : a timetable slot in Alpha-South (${south.id})\n`);

// Build a timetable + slot in Alpha-SOUTH.
const southClass = await prisma.class.findFirst({ where: { campusId: south.id }, select: { id: true } });
const tt = await prisma.timetable.upsert({
  where: { classId_academicYear_term: { classId: southClass.id, academicYear: 2026, term: "ANNUAL" } },
  create: { schoolId: T1.schoolId, campusId: south.id, classId: southClass.id, academicYear: 2026, term: "ANNUAL" },
  update: {},
});
const slot = await prisma.timetableSlot.upsert({
  where: { timetableId_dayOfWeek_periodNumber: { timetableId: tt.id, dayOfWeek: 1, periodNumber: 1 } },
  create: { schoolId: T1.schoolId, timetableId: tt.id, dayOfWeek: 1, periodNumber: 1,
            startTime: "08:00", endTime: "08:40", slotType: "CLASS", teacherId: null },
  update: { teacherId: null },
});
console.log(`south timetable : ${tt.id}\nsouth slot      : ${slot.id}\nteacherBefore   : ${slot.teacherId}\n`);

// Attack: assign a NORTH teacher onto the SOUTH slot, as the NORTH admin.
const res = await fetch(`${BASE}/api/timetable/${tt.id}/suggestions`, {
  method: "POST",
  headers: { cookie: `skoolee_token=${admin.token}`, "content-type": "application/json" },
  body: JSON.stringify({ action: { type: "REASSIGN_TEACHER", slotId: slot.id, teacherId: teacherNorth.userId } }),
});
const bodyText = await res.text();
console.log(`HTTP ${res.status}`);
console.log(bodyText.slice(0, 300));

const after = await prisma.timetableSlot.findUnique({ where: { id: slot.id }, select: { teacherId: true } });
console.log(`\nteacherAfter    : ${after?.teacherId}`);

const written = after?.teacherId === teacherNorth.userId;
console.log(`\n${"=".repeat(60)}`);
console.log(written
  ? "CONFIRMED: cross-CAMPUS write succeeded. Alpha-North admin modified an\n           Alpha-South timetable slot. ISO-6.1 FAIL."
  : "NOT EXPLOITABLE: the write was rejected. ISO-6.1 PASS for this path.");
console.log("=".repeat(60));

await prisma.timetableSlot.update({ where: { id: slot.id }, data: { teacherId: null } });
await prisma.$disconnect();
process.exit(written ? 1 : 0);
