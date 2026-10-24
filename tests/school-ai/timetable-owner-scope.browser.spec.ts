import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated timetable owner-scope database.");
const db = new PrismaClient(), schoolId = `timetable-owner-${randomUUID()}`, foreignSchool = `timetable-foreign-${randomUUID()}`;
const origin = "http://localhost:3106", headers = { Origin: origin };
const alpha = randomUUID(), beta = randomUUID(), foreignCampus = randomUUID(), owner = randomUUID(), manager = randomUUID(), teacher = randomUUID();
const classA = randomUUID(), classB = randomUUID(), foreignClass = randomUUID(), foreignBoard = randomUUID(), subject = randomUUID(), room = randomUUID();
const tokens: Record<string, string> = {};
const create = (classId: string, campusId?: string) => ({ classId, ...(campusId ? { campusId } : {}), academicYear: 2026, periods: [{ period: 1, start: "08:00", end: "08:40" }] });
test.beforeAll(async () => {
  for (const id of [schoolId, foreignSchool]) await db.school.create({ data: { id, name: "Synthetic timetable ownership", slug: id, regId: id, city: "Test", contactEmail: `${id}@example.test`, registrationKind: "GROUP", status: "ACTIVE", plan: "PRO" } });
  await db.campus.createMany({ data: [[alpha, schoolId], [beta, schoolId], [foreignCampus, foreignSchool]].map(([id, tenant]) => ({ id, schoolId: tenant, name: "Scope campus", city: "Test", regId: id })) });
  for (const [id, role, campusId] of [[owner, "SUPER_ADMIN", null], [manager, "ADMIN", alpha], [teacher, "TEACHER", alpha]] as const) {
    await db.user.create({ data: { id, schoolId, campusId, role, email: `${id}@example.test`, fullName: "Synthetic actor", isActive: true, onboardingComplete: true, mfaEnabled: true } });
    const token = await new SignJWT({ userId: id, schoolId, campusId, role, email: `${id}@example.test`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
    tokens[role] = token;
    await db.loginSession.create({ data: { userId: id, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  }
  await db.class.createMany({ data: [[classA, alpha, schoolId], [classB, beta, schoolId], [foreignClass, foreignCampus, foreignSchool]].map(([id, campusId, tenant]) => ({ id, campusId, schoolId: tenant, name: "Scope class", academicYear: 2026, teachingMode: "SUBJECT" as const })) });
  await db.subject.create({ data: { id: subject, schoolId, campusId: alpha, classId: classA, name: "Scope subject", teacherId: teacher } });
  await db.classRoom.create({ data: { id: room, schoolId, campusId: alpha, roomNumber: "Scope room", capacity: 30 } });
  await db.timetable.create({ data: { id: foreignBoard, schoolId: foreignSchool, campusId: foreignCampus, classId: foreignClass, academicYear: 2026 } });
});
test.afterAll(async () => { await db.school.deleteMany({ where: { id: { in: [schoolId, foreignSchool] } } }); await db.$disconnect(); });
async function signIn(context: BrowserContext, role = "SUPER_ADMIN") {
  await context.clearCookies(); await context.addCookies([{ name: "skoolee_token", value: tokens[role], url: origin, httpOnly: true, sameSite: "Lax" }]);
}

test("owner without a default campus creates, repairs, publishes and deletes the selected campus timetable", async ({ page, context }) => {
  await signIn(context);
  const first = await page.request.post("/api/timetable", { headers, data: create(classA, alpha) });
  expect(first.status(), await first.text()).toBe(201); const board = (await first.json()).data;
  const derived = await page.request.post("/api/timetable", { headers, data: create(classB) });
  expect(derived.status(), await derived.text()).toBe(201); const second = (await derived.json()).data;
  expect(second.campusId).toBe(beta);
  expect((await page.request.get(`/api/timetable/${board.id}`)).status()).toBe(200);
  const slot = board.slots.find((item: { dayOfWeek: number }) => item.dayOfWeek === 1);
  const saved = await page.request.put(`/api/timetable/${board.id}`, { headers, data: { slots: [{ id: slot.id, subjectId: subject }] } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  expect((await page.request.get(`/api/timetable/${board.id}/suggestions`)).status()).toBe(200);
  for (const action of [{ type: "REASSIGN_TEACHER", teacherId: teacher }, { type: "REASSIGN_ROOM", roomId: room }]) {
    const fixed = await page.request.post(`/api/timetable/${board.id}/suggestions`, { headers, data: { action: { ...action, slotId: slot.id } } });
    expect(fixed.ok(), await fixed.text()).toBeTruthy();
  }
  for (const action of ["publish", "unpublish"]) {
    const status = await page.request.put(`/api/timetable/${board.id}`, { headers, data: { action } });
    expect(status.ok(), await status.text()).toBeTruthy();
  }
  for (const id of [board.id, second.id]) expect((await page.request.delete(`/api/timetable/${id}`, { headers })).status()).toBe(200);
});

test("owner cannot spoof another tenant or mismatch selected campus, and campus managers remain campus-bound", async ({ page, context }) => {
  await signIn(context);
  expect((await page.request.post("/api/timetable", { headers, data: create(classA, beta) })).status()).toBe(403);
  expect((await page.request.post("/api/timetable", { headers, data: create(foreignClass, foreignCampus) })).status()).toBe(404);
  for (const path of [`/api/timetable/${foreignBoard}`, `/api/timetable/${foreignBoard}/suggestions`]) expect((await page.request.get(path)).status()).toBe(404);
  expect((await page.request.put(`/api/timetable/${foreignBoard}`, { headers, data: { action: "publish" } })).status()).toBe(404);
  expect((await page.request.delete(`/api/timetable/${foreignBoard}`, { headers })).status()).toBe(404);
  expect((await page.request.post(`/api/timetable/${foreignBoard}/suggestions`, { headers, data: { action: { type: "REASSIGN_TEACHER", slotId: "foreign", teacherId: teacher } } })).status()).toBe(404);
  const betaBoard = await db.timetable.create({ data: { schoolId, campusId: beta, classId: classB, academicYear: 2026 } });
  await signIn(context, "ADMIN");
  expect((await page.request.post("/api/timetable", { headers, data: create(classB, beta) })).status()).toBe(404);
  expect((await page.request.get(`/api/timetable/${betaBoard.id}`)).status()).toBe(404);
  expect((await page.request.put(`/api/timetable/${betaBoard.id}`, { headers, data: { action: "publish" } })).status()).toBe(404);
  expect((await page.request.delete(`/api/timetable/${betaBoard.id}`, { headers })).status()).toBe(404);
  expect((await db.timetable.findUniqueOrThrow({ where: { id: betaBoard.id } })).status).toBe("DRAFT");
});
