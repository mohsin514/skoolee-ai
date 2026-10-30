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
import { recordMapping } from "../../src/lib/curriculum/service";
import type { CurriculumData, PaperData } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

// SKO-407 browser acceptance: bank alignment to the paper's curriculum, objective filter and coverage gaps.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.BANK_TEST_APP || "http://localhost:3107";
const evidence = process.env.BANK_EVIDENCE_DIR || "/tmp/sko407-evidence";
const raw = new PrismaClient(), password = "SyntheticBank407!";
const schoolId = `bank407b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, draftId = "";

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
async function openDraft(key: string, tab: string, viewport?: { width: number; height: number }) {
  const ctx = await context(key, viewport), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/ai");
  await page.getByRole("button", { name: tab, exact: true }).click();
  await page.locator('select[id$="assessment-record"]').selectOption(draftId);
  return { ctx, page, errors };
}
/** The workspace scrolls inside its own panel, so evidence shots focus on the region under test. */
const shot = async (page: Page, region: string, name: string, focus?: ReturnType<Page["locator"]>) => { await settled(page); const target = focus ?? page.getByRole("region", { name: region, exact: true }); await target.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${evidence}/${name}.png` }); };

function curriculum(prefix: string, board: string, extra: CurriculumData["outcomes"] = []): CurriculumData {
  const { curriculum } = assessmentFixture(subjectId, classId);
  curriculum.board = board;
  curriculum.outcomes = [{ id: `${prefix}add`, code: `${prefix.toUpperCase()}M1`, title: "Add whole numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: true }, ...extra];
  return curriculum;
}

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Cypress School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Dubai", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Cypress Main", regId: campusId, city: "Dubai" } });
  const lead = await person("lead", "CAMPUS_ADMIN"); await person("lead-ar", "CAMPUS_ADMIN", "ar"); await person("lead-ur", "CAMPUS_ADMIN", "ur");
  const teacher = await person("teacher", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 2", section: "B", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: teacher.userId } });
  const approve = async (kind: "CURRICULUM" | "PAPER", title: string, data: unknown) => { const created = await createWorkspaceRecord(lead, { kind, campusId, title, data: data as Record<string, unknown>, idempotencyKey: randomUUID() }); return updateWorkspaceRecord(lead, created.id, { version: created.version, action: "approve" }); };
  const boardA = await approve("CURRICULUM", "Board A Mathematics", curriculum("a-", "Synthetic Board A"));
  const boardB = await approve("CURRICULUM", "Board B Mathematics", curriculum("b-", "Synthetic Board B", [{ id: "b-compare", code: "B-M2", title: "Compare numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: true }]));
  const source = assessmentFixture(subjectId, classId).paper;
  source.blueprint.sections = source.blueprint.sections.map(section => ({ ...section, outcomeIds: ["a-add"] }));
  source.questions = source.questions.map(question => ({ ...question, outcomeIds: ["a-add"] }));
  await approve("PAPER", "Board A Unit 1 quiz", { ...source, curriculumId: boardA.id, curriculumVersion: boardA.version });
  await recordMapping(lead, { from: { recordId: boardB.id, version: boardB.version, outcomeId: "b-add" }, to: { recordId: boardA.id, version: boardA.version, outcomeId: "a-add" }, relation: "PARTIAL", note: "Board B stops at 100." });
  // A Board B draft with one question so far: Compare numbers and two slots are still uncovered.
  const draft: PaperData = { ...assessmentFixture(subjectId, classId).paper, curriculumId: boardB.id, curriculumVersion: boardB.version };
  draft.blueprint.title = "Board B Unit 1 check";
  draft.blueprint.sections = draft.blueprint.sections.map(section => ({ ...section, outcomeIds: section.id === "a" ? ["b-add", "b-compare"] : ["b-add"] }));
  draft.questions = [{ ...draft.questions[0], outcomeIds: ["b-add"] }];
  draftId = (await createWorkspaceRecord(lead, { kind: "PAPER", campusId, title: "Board B Unit 1 check", data: draft as unknown as Record<string, unknown>, idempotencyKey: randomUUID() })).id;
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the draft shows specific coverage gaps in marks", async () => {
  const { ctx, page, errors } = await openDraft("lead", "Curriculum & papers");
  const gaps = page.getByRole("region", { name: "Coverage still missing", exact: true });
  await gaps.getByText("2 marks of \u2068Compare numbers\u2069 coverage are still missing in \u2068A\u2069.").waitFor();
  await gaps.getByText("\u2068B\u2069: 3 marks of question slots are still empty.").waitFor();
  await shot(page, "Coverage still missing", "bank-coverage-gaps-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("a Board A question reused into Board B offers only the lead-mapped objective", async () => {
  const { ctx, page, errors } = await openDraft("lead", "Curriculum & papers");
  const bank = page.getByRole("region", { name: "Reusable question bank", exact: true });
  await bank.getByRole("button", { name: "Search bank" }).click();
  const card = bank.locator("article").filter({ hasText: "Choose the result of adding two and two." }).first();
  await card.getByText("Mapped by a curriculum lead").waitFor();
  await card.getByRole("button", { name: "Review and reuse" }).click();
  await bank.getByLabel("Target section").selectOption({ index: 1 });
  const mapping = bank.getByLabel(/^Map to a current outcome/);
  assert.deepEqual(await mapping.locator("option").allTextContents(), ["Choose…", "Add whole numbers (partly overlaps)"], "Compare numbers is never offered: no lead decision maps to it");
  await bank.getByText("Only objectives a curriculum lead mapped are offered.").waitFor();
  await mapping.selectOption({ label: "Add whole numbers (partly overlaps)" });
  await shot(page, "Reusable question bank", "bank-lead-mapped-reuse-en-1440", mapping);
  await bank.getByLabel("Objective in this curriculum").selectOption({ label: "B-M2 · Compare numbers" });
  await bank.getByRole("button", { name: "Search bank" }).click();
  await bank.getByText("No matching approved questions on this page.").waitFor();
  assert.deepEqual(errors, []); await ctx.close();
});

test("Arabic and Urdu leads see the bank and gaps right-to-left at 390px", async () => {
  for (const [key, tab, gapsTitle, bankTitle] of [["lead-ar", "المناهج والأوراق", "تغطية ما زالت ناقصة", "بنك الأسئلة القابلة لإعادة الاستخدام"], ["lead-ur", "نصاب اور پرچے", "کوریج ابھی باقی ہے", ""]] as const) {
    const ctx = await context(key, { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/ai");
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.locator('select[id$="assessment-record"]').selectOption(draftId);
    await page.getByRole("region", { name: gapsTitle, exact: true }).waitFor();
    if (bankTitle) await page.getByRole("region", { name: bankTitle, exact: true }).waitFor();
    assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
    assert.equal(await noOverflow(page), true, key);
    await shot(page, gapsTitle, `bank-coverage-gaps-${key}-390`);
    assert.deepEqual(errors, []); await ctx.close();
  }
});
