import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { schoolAiTransaction } from "../../src/lib/school-ai/transaction";
import { admissionNumberAllocator } from "../../src/lib/students/admission-number";

// SKAI-167: the year-close route allocates inside the campus-scoped schoolAiTransaction. QA found the
// allocator only saw the caller's campus there, so North issued ADM-2031-0001 while Main held 0007.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const db = new PrismaClient();
const schoolA = `adm167a-${randomUUID()}`, schoolB = `adm167b-${randomUUID()}`;
const mainA = randomUUID(), northA = randomUUID(), mainB = randomUUID();
const user = (schoolId: string, campusId: string): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role: "PRINCIPAL", email: `${randomUUID()}@example.invalid`, institutionKind: "GROUP" });

async function seed(schoolId: string, campuses: string[]) {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Admissions School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const id of campuses) await db.campus.create({ data: { id, schoolId, name: id, regId: id, city: "Lahore" } });
}
async function pupil(schoolId: string, campusId: string, admissionNo: string | null) {
  const cls = await db.class.create({ data: { schoolId, campusId, name: randomUUID(), section: "A", academicYear: 2031 } });
  await db.student.create({ data: { schoolId, campusId, classId: cls.id, fullName: "Synthetic Pupil", rollNo: randomUUID(), gender: "FEMALE", admissionNo } });
}
const allocate = (u: AuthUser, n: number) => schoolAiTransaction(u, async (tx) => {
  const next = await admissionNumberAllocator(tx, u.schoolId, 2031);
  return Array.from({ length: n }, () => next());
});

before(async () => {
  await seed(schoolA, [mainA, northA]);
  await seed(schoolB, [mainB]);
  await pupil(schoolA, mainA, "ADM-2031-0007");
  await pupil(schoolA, mainA, "ADM-2031-0008");
});
after(async () => {
  await db.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await db.$disconnect(); await prisma.$disconnect();
});

test("a North principal continues the school-wide sequence after Main's numbers", async () => {
  assert.deepEqual(await allocate(user(schoolA, northA), 2), ["ADM-2031-0009", "ADM-2031-0010"]);
});

test("another school keeps its own sequence and never sees school A's numbers", async () => {
  assert.deepEqual(await allocate(user(schoolB, mainB), 1), ["ADM-2031-0001"]);
});
