import { captureEvidence } from "./screenshot-evidence";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient, type UserRole } from "@prisma/client";
import { resetDemoTenant, DEMO_SCHOOL_ID } from "../../scripts/demo/reset-demo-tenant";

/** Run serially against the synthetic tenant only, after the slice suites (each resets it). */
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (!["127.0.0.1", "localhost"].includes(database.hostname)) throw new Error("Use only a loopback database for this suite.");
const db = new PrismaClient();
const origin = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";
const password = process.env.DEMO_PASSWORD ?? "";
const headers = { Origin: origin };
const shots = process.env.EXAM_STUDIO_ROLE_SHOTS;
const extraRoles: UserRole[] = ["ADMIN", "CAMPUS_ADMIN", "SUPER_ADMIN", "APP_OWNER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "TEACHER"];
const emailFor = (role: UserRole) => `demo-role-${role.toLowerCase()}@example.invalid`;
let slotId = "", paperId = "", sessionId = "", principalId = "";
const paperOf = () => db.schoolAiRecord.findUniqueOrThrow({ where: { id: paperId }, select: { version: true, data: true } });

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
test.afterAll(async () => { await db.$disconnect(); });

async function signIn(browser: Browser, email: string): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const response = await context.request.post("/api/auth/login", { headers, data: { email, password } });
  expect(response.ok(), `${email}: sign in`).toBeTruthy();
  if ((await response.json()).mfaRequired) expect((await context.request.post("/api/auth/mfa", { headers, data: { action: "defer" } })).ok()).toBeTruthy();
  await context.addCookies([{ name: "skoolee-lang", value: "en", url: origin }]);
  return context;
}

async function capture(page: Page, name: string) {
  if (!shots) return;
  await expect(page.locator("body")).not.toBeEmpty();
  await captureEvidence(page, { path: `${shots}/${name}.png`, fullPage: true });
}

test.beforeAll(async ({ browser }) => {
  await resetDemoTenant(db, password);
  const principal = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, role: "PRINCIPAL" } });
  principalId = principal.id;
  for (const role of extraRoles) await db.user.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: principal.campusId, role, email: emailFor(role), password: principal.password, fullName: `Synthetic ${role}`, isActive: true, onboardingComplete: true, preferredLanguage: "en" } });
  const office = await signIn(browser, "demo-principal@example.invalid");
  const teacher = await signIn(browser, "demo-teacher@example.invalid");
  const hod = await signIn(browser, "demo-hod@example.invalid");
  sessionId = (await db.examSession.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } })).id;
  expect((await office.request.post(`/api/academic/exam-sessions/${sessionId}/paper-slots`, { headers, data: {} })).ok()).toBeTruthy();
  slotId = (await db.examPaperSlot.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } })).id;
  await db.examPaperSlot.update({ where: { id: slotId }, data: { totalMarks: 5, durationMinutes: 20 } });
  const source = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, kind: "PAPER" }, orderBy: { createdAt: "asc" } });
  const created = await teacher.request.post("/api/school-ai/workspace", { headers, data: { kind: "PAPER", title: "Synthetic role-matrix paper", idempotencyKey: `roles-${Date.now()}`, data: { ...(source.data as object), slotId, examType: "MID_TERM" } } });
  expect(created.ok()).toBeTruthy();
  paperId = (await created.json()).record.id;
  for (const question of ((await paperOf()).data as { questions: Array<{ id: string }> }).questions) expect((await teacher.request.post(`/api/school-ai/workspace/${paperId}/item-review`, { headers, data: { version: (await paperOf()).version, questionId: question.id, target: "READY_FOR_REVIEW", itemRevision: 1 } })).ok()).toBeTruthy();
  expect((await teacher.request.patch(`/api/school-ai/workspace/${paperId}`, { headers, data: { version: (await paperOf()).version, action: "review" } })).ok()).toBeTruthy();
  expect((await teacher.request.post(`/api/academic/paper-slots/${slotId}/moderation`, { headers, data: { paperVersion: (await paperOf()).version, decision: "SIGNED" } })).status()).toBe(403);
  expect((await hod.request.post(`/api/academic/paper-slots/${slotId}/moderation`, { headers, data: { paperVersion: (await paperOf()).version, decision: "SIGNED" } })).ok()).toBeTruthy();
  expect((await teacher.request.post(`/api/school-ai/workspace/${paperId}/rehearsal`, { headers, data: { version: (await paperOf()).version, findings: [] } })).ok()).toBeTruthy();
  await office.close(); await teacher.close(); await hod.close();
});

test("author, head of department and principal have distinct authoring, moderation and seal rights", async ({ browser }) => {
  const teacher = await signIn(browser, "demo-teacher@example.invalid");
  const hod = await signIn(browser, "demo-hod@example.invalid");
  const principal = await signIn(browser, "demo-principal@example.invalid");
  for (const context of [teacher, hod]) expect((await context.request.post(`/api/academic/paper-slots/${slotId}/seal`, { headers, data: { paperVersion: (await paperOf()).version } })).status()).toBe(403);
  expect((await principal.request.post(`/api/academic/paper-slots/${slotId}/seal`, { headers, data: { paperVersion: (await paperOf()).version } })).ok()).toBeTruthy();
  const schedule = await db.examSchedule.findFirstOrThrow({ where: { paperSlotId: slotId } });
  expect((await principal.request.get(`/api/academic/paper-slots/${slotId}/print-run?scheduleId=${schedule.id}`)).ok()).toBeTruthy();
  expect((await teacher.request.get(`/api/academic/paper-slots/${slotId}/print-run?scheduleId=${schedule.id}`)).status()).toBe(403);
  for (const [context, role] of [[teacher, "teacher"], [hod, "head-of-department"], [principal, "principal"]] as const) {
    const page = await context.newPage();
    await page.goto("/ai/studio");
    await expect(page.locator("[data-exam-studio]")).toBeVisible();
    await capture(page, `${role}-exam-studio`);
    await context.close();
  }
});

test("campus operators gain the academic lead desk only while the principal seat is vacant", async ({ browser }) => {
  for (const role of ["ADMIN", "CAMPUS_ADMIN"] as const) {
    const context = await signIn(browser, emailFor(role));
    const page = await context.newPage();
    await page.goto("/ai/studio");
    await expect(page).toHaveURL(/\/admin(?:\?|$)/);
    expect((await context.request.post(`/api/academic/paper-slots/${slotId}/seal`, { headers, data: { paperVersion: (await paperOf()).version } })).status()).toBe(403);
    await capture(page, `${role.toLowerCase()}-principal-present`);
    await context.close();
  }
  await db.user.update({ where: { id: principalId }, data: { isActive: false } });
  try {
    for (const role of ["ADMIN", "CAMPUS_ADMIN"] as const) {
      const context = await signIn(browser, emailFor(role));
      const page = await context.newPage();
      await page.goto("/ai/studio");
      await expect(page.locator("[data-exam-studio]")).toBeVisible();
      // Reset only this synthetic fixture's seal to exercise a real successful seal for each acting lead.
      await db.examPaperSlot.update({ where: { id: slotId }, data: { sealedAt: null, sealHash: null, sealedById: null, sealedSittingDate: null } });
      expect((await context.request.post(`/api/academic/paper-slots/${slotId}/seal`, { headers, data: { paperVersion: (await paperOf()).version } })).ok()).toBeTruthy();
      expect((await db.examPaperSlot.findUniqueOrThrow({ where: { id: slotId } })).sealedById).toBe((await db.user.findFirstOrThrow({ where: { email: emailFor(role), schoolId: DEMO_SCHOOL_ID } })).id);
      await capture(page, `${role.toLowerCase()}-acting-academic-lead`);
      await context.close();
    }
  } finally { await db.user.update({ where: { id: principalId }, data: { isActive: true } }); }
  // Restoring the seat revokes the acting lead's authority on the next request.
  const restored = await signIn(browser, emailFor("CAMPUS_ADMIN"));
  expect((await restored.request.post(`/api/academic/paper-slots/${slotId}/seal`, { headers, data: { paperVersion: (await paperOf()).version } })).status()).toBe(403);
  await restored.close();
});

test("group oversight has no Studio or seal, and platform support has no tenant paper content", async ({ browser }) => {
  const group = await signIn(browser, emailFor("SUPER_ADMIN"));
  expect((await group.request.get(`/api/academic/exam-sessions/${sessionId}/paper-slots`)).ok()).toBeTruthy();
  expect((await group.request.post(`/api/academic/paper-slots/${slotId}/seal`, { headers, data: { paperVersion: (await paperOf()).version } })).status()).toBe(403);
  const groupPage = await group.newPage(); await groupPage.goto("/ai/studio");
  await expect(groupPage).toHaveURL(/\/super(?:\?|$)/);
  await expect(groupPage.locator("[data-exam-studio]")).toHaveCount(0);
  await capture(groupPage, "group-admin-oversight");
  await group.close();

  const owner = await signIn(browser, emailFor("APP_OWNER"));
  expect([403, 404]).toContain((await owner.request.get(`/api/school-ai/workspace/${paperId}`)).status());
  expect([403, 404]).toContain((await owner.request.get(`/api/academic/paper-slots/${slotId}/moderation`)).status());
  const ownerPage = await owner.newPage(); await ownerPage.goto("/ai/studio");
  await expect(ownerPage).toHaveURL(/\/owner(?:\?|$)/);
  await capture(ownerPage, "platform-owner-no-tenant-studio");
  await owner.close();
});

test("an unrelated teacher cannot see scripts; a named exam coordinator gains custody but not sealing", async ({ browser }) => {
  const teacher = await signIn(browser, emailFor("TEACHER"));
  for (const path of [`/api/school-ai/workspace/${paperId}`, `/api/academic/paper-slots/${slotId}/moderation`, `/api/academic/paper-slots/${slotId}/sitting`]) expect([403, 404]).toContain((await teacher.request.get(path)).status());
  const actor = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: emailFor("TEACHER") } });
  const schedule = await db.examSchedule.findFirstOrThrow({ where: { paperSlotId: slotId } });
  await db.campus.update({ where: { id: actor.campusId! }, data: { examCoordinatorUserId: actor.id } });
  try {
    expect((await teacher.request.get(`/api/academic/paper-slots/${slotId}/sitting`)).ok()).toBeTruthy();
    expect((await teacher.request.get(`/api/academic/paper-slots/${slotId}/print-run?scheduleId=${schedule.id}`)).ok()).toBeTruthy();
    expect((await teacher.request.post(`/api/academic/paper-slots/${slotId}/seal`, { headers, data: { paperVersion: (await paperOf()).version } })).status()).toBe(403);
    const page = await teacher.newPage(); await page.goto("/ai/studio");
    await expect(page.locator("[data-exam-studio]")).toBeVisible();
    await capture(page, "teacher-exam-coordinator");
  } finally { await db.campus.update({ where: { id: actor.campusId! }, data: { examCoordinatorUserId: null } }); }
  expect((await teacher.request.get(`/api/academic/paper-slots/${slotId}/sitting`)).status()).toBe(404);
  await teacher.close();
});

test("revoking the exams grant removes script and moderation rights on the next request", async ({ browser }) => {
  const author = await signIn(browser, "demo-teacher@example.invalid");
  const hod = await signIn(browser, "demo-hod@example.invalid");
  const where = { schoolId_role_module: { schoolId: DEMO_SCHOOL_ID, role: "TEACHER" as const, module: "exams" } };
  const previous = await db.rolePermission.findUnique({ where });
  await db.rolePermission.upsert({ where, create: { ...where.schoolId_role_module, canView: true, canAdd: false, canEdit: false, canDelete: false }, update: { canView: true, canAdd: false, canEdit: false, canDelete: false } });
  try {
    const script = await db.examPaperScript.findFirstOrThrow({ where: { slotId } });
    expect((await author.request.post("/api/academic/paper-scripts/scan", { headers, data: { code: script.id } })).status()).toBe(403);
    expect((await hod.request.post(`/api/academic/paper-slots/${slotId}/moderation`, { headers, data: { paperVersion: (await paperOf()).version, decision: "SIGNED" } })).status()).toBe(403);
    await db.rolePermission.update({ where, data: { canView: false } });
    expect((await author.request.get(`/api/academic/paper-slots/${slotId}/sitting`)).status()).toBe(403);
    expect((await hod.request.get(`/api/academic/paper-slots/${slotId}/moderation`)).status()).toBe(403);
  } finally {
    if (previous) await db.rolePermission.update({ where, data: { canView: previous.canView, canAdd: previous.canAdd, canEdit: previous.canEdit, canDelete: previous.canDelete, updatedAt: previous.updatedAt } });
    else await db.rolePermission.delete({ where });
    await author.close(); await hod.close();
  }
});

for (const [role, email, home] of [
  ["ACCOUNTANT", emailFor("ACCOUNTANT"), "/accountant"],
  ["LIBRARIAN", emailFor("LIBRARIAN"), "/librarian"],
  ["RECEPTIONIST", emailFor("RECEPTIONIST"), "/receptionist"],
  ["STUDENT", "demo-student@example.invalid", "/student"],
  ["PARENT", "demo-guardian@example.invalid", "/parent"],
] as const) test(`${role} cannot access authoring, moderation, scripts or staff keys`, async ({ browser }) => {
  const context = await signIn(browser, email);
  for (const path of [`/api/school-ai/workspace/${paperId}`, `/api/academic/paper-slots/${slotId}/moderation`, `/api/academic/paper-slots/${slotId}/sitting`]) expect([403, 404]).toContain((await context.request.get(path)).status());
  expect([403, 404]).toContain((await context.request.post(`/api/academic/paper-slots/${slotId}/seal`, { headers, data: { paperVersion: (await paperOf()).version } })).status());
  const page = await context.newPage(); await page.goto("/ai/studio");
  await expect(page).toHaveURL(new RegExp(`${home}(?:\\?|$)`));
  await expect(page.locator("[data-exam-studio]")).toHaveCount(0);
  await capture(page, `${role.toLowerCase()}-appropriate-home`);
  await context.close();
});
