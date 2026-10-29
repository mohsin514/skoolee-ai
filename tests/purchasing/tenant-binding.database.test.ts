import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runAsUser } from "../../src/lib/db/tenant-context";
import { purchasingOverview } from "../../src/lib/purchasing/service";
import { overview as taxOverview } from "../../src/lib/tax/service";

// SKAI-1028 / SKAI-1030: purchasing and tax load when bound with runAsUser, each school and campus sees only its own
// rows, an unbound call is refused by the guard, and denied roles get a 403.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient();
const schools = [`tb-a-${randomUUID()}`, `tb-b-${randomUUID()}`];
const campuses = { [schools[0]]: [randomUUID(), randomUUID()], [schools[1]]: [randomUUID()] };
const actor = (schoolId: string, campusId: string | null, role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` } as AuthUser);
const adminA1 = actor(schools[0], campuses[schools[0]][0], "CAMPUS_ADMIN");
const adminA2 = actor(schools[0], campuses[schools[0]][1], "CAMPUS_ADMIN");
const adminB = actor(schools[1], campuses[schools[1]][0], "CAMPUS_ADMIN");
const ownerA = actor(schools[0], null, "SUPER_ADMIN");
const teacherA = actor(schools[0], campuses[schools[0]][0], "TEACHER");

before(async () => {
  for (const id of schools) {
    await raw.school.create({ data: { id, name: "Synthetic tenant-binding school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
    for (const campusId of campuses[id]) {
      await raw.campus.create({ data: { id: campusId, schoolId: id, name: `Campus ${campusId.slice(0, 4)}`, regId: campusId, city: "Synthetic" } });
    }
  }
  for (const u of [adminA1, adminA2, adminB, ownerA, teacherA]) await raw.user.create({ data: { id: u.userId, schoolId: u.schoolId, campusId: u.campusId, role: u.role, email: u.email, fullName: `Synthetic ${u.role}`, onboardingComplete: true } });
  for (const u of [adminA1, adminA2, adminB]) await raw.purchaseBudget.create({ data: { schoolId: u.schoolId, campusId: u.campusId!, costCenter: "IT", period: "2027", amount: 1000, currency: "PKR", approvalLimit: 500, createdById: u.userId } });
});
after(async () => {
  for (const id of schools) {
    await raw.purchaseBudget.deleteMany({ where: { schoolId: id } });
    await raw.user.deleteMany({ where: { schoolId: id } });
    await raw.school.deleteMany({ where: { id } });
  }
  await raw.$disconnect(); await prisma.$disconnect();
});

test("purchasing loads per campus and never shows another school's or campus's budgets", async () => {
  const [a1, a2, b] = await Promise.all([adminA1, adminA2, adminB].map((u) => runAsUser(u, () => purchasingOverview(u))));
  assert.deepEqual(a1.budgets.map((x) => x.campusId), [adminA1.campusId]);
  assert.deepEqual(a2.budgets.map((x) => x.campusId), [adminA2.campusId]);
  assert.deepEqual(b.budgets.map((x) => x.schoolId), [adminB.schoolId]);
});

test("an unbound purchasing load is refused by the tenant guard", async () => {
  await assert.rejects(() => purchasingOverview(adminA1), { name: "TenantContextError" });
});

test("tax packages load for the school authority and are refused to a teacher", async () => {
  const data = await runAsUser(ownerA, () => taxOverview(ownerA));
  assert.deepEqual(data.campuses.map((c) => c.id).sort(), [...campuses[schools[0]]].sort(), "only this school's campuses");
  await assert.rejects(() => runAsUser(teacherA, () => taxOverview(teacherA)), { status: 403 });
});
