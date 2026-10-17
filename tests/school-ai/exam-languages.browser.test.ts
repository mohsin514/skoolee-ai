import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { paperDataSchema } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R9 browser acceptance: an Arabic version of a form side by side with the original, mismatches blocking release.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.RELEASE_TEST_APP || "http://localhost:3107";
const evidence = process.env.RELEASE_EVIDENCE_DIR || "/tmp/sko408-languages-evidence";
const raw = new PrismaClient(), password = "SyntheticLang408!";
const schoolId = `lng408b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, paperId = "";

async function person(key: string, role: AuthUser["role"], language = "en") {
  const user: AuthUser = { userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 };
  await raw.user.create({ data: { id: user.userId, email: user.email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, user);
  return user;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved });
  const ctx = await browser.newContext({ viewport });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png` }); };
async function openForms(page: Page, name: RegExp) {
  await page.goto(`${base}/ai/studio`);
  await page.keyboard.press("Shift");
  await page.locator("[data-studio-intro]").waitFor({ state: "detached" }).catch(() => undefined);
  await page.getByRole("navigation", { name: /Studio spaces|مساحات الاستوديو/ }).getByRole("button", { name }).click();
  const space = page.locator("[data-forms-space]");
  await space.waitFor();
  await space.locator("select").first().selectOption(paperId);
  return space;
}
const arabic = async () => (await raw.schoolAiRecord.findMany({ where: { schoolId, kind: "PAPER" } })).find(row => paperDataSchema.parse(row.data).language === "ar")!;

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Juniper Language School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Multan", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Juniper Main", regId: campusId, city: "Multan" } });
  const lead = await person("lead", "CAMPUS_ADMIN"); await person("lead-ar", "CAMPUS_ADMIN", "ar");
  const author = await person("author", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "D", academicYear: 2026, classTeacherId: author.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  for (const [index, key] of ["learner1", "learner2", "learner3"].entries()) {
    const learner = await person(key, "STUDENT");
    await raw.student.create({ data: { id: randomUUID(), schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", status: "active" } });
  }
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Grade 8 mathematics", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  paperId = (await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "End of term", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() })).id;
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the author prepares an Arabic version and sees it beside the original, flagged as untranslated", async () => {
  const ctx = await context("author"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const space = await openForms(page, /Blueprint/);
  await space.getByRole("button", { name: "Prepare language versions only" }).click();
  await space.locator('[data-form="A"]').waitFor();
  const add = space.locator("[data-add-language]");
  await add.getByLabel("Language").selectOption("ar");
  await add.getByRole("button", { name: "Add a language version" }).click();
  const compare = space.locator('[data-language-compare="A-ar"]');
  await compare.waitFor();
  assert.equal(await compare.getByText("Still the original text").count(), 3);
  await compare.scrollIntoViewIfNeeded();
  await shot(page, "languages-untranslated-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("a translated version with a changed key structure is named and blocks the set", async () => {
  const author = people.get("author")!;
  const row = await arabic();
  const data = paperDataSchema.parse(row.data);
  await updateWorkspaceRecord(author, row.id, { version: row.version, data: { ...data, questions: data.questions.map(question => question.id === "q1" ? { ...question, prompt: "ما ناتج 2 + 2؟" } : question.id === "q2" ? { ...question, prompt: "اختر ناتج جمع اثنين واثنين.", options: [...question.options, { id: "a3", text: "٦" }] } : { ...question, prompt: "اشرح كيف تجمع عددين." }) } as unknown as Record<string, unknown> });
  const ctx = await context("author"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const space = await openForms(page, /Blueprint/);
  const compare = space.locator('[data-language-compare="A-ar"]');
  await compare.locator('[data-language-codes="KEY_STRUCTURE_MISMATCH"]').getByText("Key structure differs").waitFor();
  await space.locator('[data-blocker="KEY_STRUCTURE_MISMATCH"]').waitFor();
  await compare.locator('[data-language-item="2"]').scrollIntoViewIfNeeded();
  await shot(page, "languages-mismatch-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("Arabic lead reads the side-by-side review right-to-left without overflow at 390px", async () => {
  const ctx = await context("lead-ar", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const space = await openForms(page, /مخطط التقييم/);
  const compare = space.locator('[data-language-compare="A-ar"]');
  await compare.getByText("بنية المفتاح مختلفة").waitFor();
  assert.equal(await noOverflow(page), true);
  await compare.locator('[data-language-item="2"]').scrollIntoViewIfNeeded();
  await shot(page, "languages-compare-ar-390");
  assert.deepEqual(errors, []); await ctx.close();
});
