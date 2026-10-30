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
import type { CurriculumData } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "../school-ai/assessment-fixture";

// SKO-406 browser acceptance against the isolated database and app.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.CURRICULUM_TEST_APP || "http://localhost:3107";
const evidence = process.env.CURRICULUM_EVIDENCE_DIR || "/tmp/sko406-evidence";
const raw = new PrismaClient(), password = "SyntheticObjective406!";
const schoolId = `cur406b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;

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
async function open(key: string, path: string, viewport?: { width: number; height: number }) {
  const ctx = await context(key, viewport), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + path);
  return { ctx, page, errors };
}
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

function curriculum(board: string, prefix: string, language: "en" | "ar" | "ur" = "en"): CurriculumData {
  const { curriculum } = assessmentFixture(subjectId, classId);
  const id = (value: string) => `${prefix}${value}`;
  curriculum.board = board;
  curriculum.pack = { authority: board, edition: "2026", language, rights: prefix ? "UNDER_REVIEW" : "APPROVED" };
  curriculum.outcomes = [
    { id: id("o-add"), code: `${prefix ? "SBB" : "SBA"}.M.1`, title: "Add whole numbers", description: "Learners add two whole numbers and explain their method.", sourceId: "source-1", sourcePage: "1", included: true, taught: true },
    { id: id("o-sub"), code: `${prefix ? "SBB" : "SBA"}.M.2`, title: "Subtract whole numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: true, prerequisiteIds: [id("o-add")] },
    { id: id("o-mul"), code: `${prefix ? "SBB" : "SBA"}.M.3`, title: "Multiply by 10 and 100", sourceId: "source-1", sourcePage: "1", included: true, taught: false, prerequisiteIds: [id("o-add")] },
  ];
  curriculum.sectionCoverage = [{ section: "Week 1", outcomeIds: [id("o-add")], taughtOn: "2026-10-05", confirmed: true }, { section: "Week 2", outcomeIds: [id("o-sub")], taughtOn: "2026-10-12", confirmed: true }];
  return curriculum;
}

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Willow School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Willow Main", regId: campusId, city: "Karachi" } });
  const lead = await person("lead", "CAMPUS_ADMIN"), teacher = await person("teacher", "TEACHER");
  await person("lead-ar", "CAMPUS_ADMIN", "ar"); await person("teacher-ur", "TEACHER", "ur");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 3", section: "A", academicYear: 2026, classTeacherId: teacher.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: teacher.userId } });
  await raw.subject.create({ data: { schoolId, campusId, classId, name: "Mathematics (Urdu medium)", teacherId: people.get("teacher-ur")!.userId } });
  const learnerId = randomUUID();
  await raw.student.create({ data: { id: learnerId, schoolId, campusId, classId, fullName: "Synthetic learner", rollNo: "1", gender: "FEMALE", status: "active" } });
  const approve = async (title: string, data: CurriculumData) => { const created = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title, data, idempotencyKey: randomUUID() }); return updateWorkspaceRecord(lead, created.id, { version: created.version, action: "approve" }); };
  const v1 = await approve("Board A Mathematics Grade 3", curriculum("Synthetic Board A", ""));
  const paper = async (pinned: { id: string; version: number }, outcomes: string[]) => {
    const { paper } = assessmentFixture(subjectId, classId);
    paper.blueprint.sections = paper.blueprint.sections.map(section => ({ ...section, outcomeIds: outcomes }));
    paper.questions = paper.questions.map(question => ({ ...question, outcomeIds: outcomes }));
    const created = await createWorkspaceRecord(lead, { kind: "PAPER", campusId, title: `Quiz on ${outcomes.join(", ")}`, data: { ...paper, coverageSection: "Week 1", curriculumId: pinned.id, curriculumVersion: pinned.version }, idempotencyKey: randomUUID() });
    return updateWorkspaceRecord(lead, created.id, { version: created.version, action: "approve" });
  };
  await paper(v1, ["o-add"]); // unreleased on v1 — becomes affected work after the rename
  const next = curriculum("Synthetic Board A", ""); next.outcomes[0].title = "Add whole numbers up to 1000";
  const saved = await updateWorkspaceRecord(lead, v1.id, { version: v1.version, data: next });
  const v2 = await updateWorkspaceRecord(lead, v1.id, { version: saved.version, action: "approve" });
  // Released evidence on the current version.
  const current = await paper(v2, ["o-add"]);
  const snapshot = (await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: current.id } })).data!;
  await raw.schoolAiExamAssignment.create({ data: { schoolId, campusId, classId, paperId: current.id, paperVersion: current.version, paperSnapshot: snapshot, createdById: lead.userId, title: "Synthetic released quiz", startsAt: new Date("2026-10-06T08:00:00Z"), endsAt: new Date("2026-10-06T09:00:00Z"), studentIds: [learnerId], status: "ACTIVE", mode: "STANDARD" } });
  await approve("Board B Mathematics Grade 3", curriculum("Synthetic Board B", "b-"));
  await raw.learningResource.create({ data: { schoolId, campusId, classId, title: "Place value chart", kind: "HANDOUT", audience: "CLASS", language: "en", sourceRights: "Synthetic", ownerId: teacher.userId, latestVersion: 1 } });
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("a lead sees the pack, separate coverage evidence and the impact of a renamed objective", async () => {
  const { ctx, page, errors } = await open("lead", "/curriculum");
  await page.getByRole("heading", { name: "Objective map" }).waitFor();
  await page.getByText("Source rights approved").waitFor();
  const add = page.getByRole("listitem").filter({ hasText: "SBA.M.1" }).first();
  await add.getByText("Taught and assessed.").waitFor();
  const multiply = page.getByRole("listitem").filter({ hasText: "SBA.M.3" }).first();
  await multiply.getByText("No teaching or assessment evidence yet.").waitFor();
  await add.getByRole("button", { name: "Evidence" }).click();
  await add.getByText("Week 1", { exact: false }).first().waitFor();
  const compare = page.getByRole("region", { name: "Compare versions" });
  await compare.getByText("Add whole numbers up to 1000").waitFor();
  await compare.getByText("Quiz on o-add", { exact: false }).waitFor();
  await page.getByRole("region", { name: "Unmapped — needs review" }).getByText("Place value chart").waitFor();
  await shot(page, "objective-map-lead-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("a lead records an explicit cross-board decision; identical titles are never merged", async () => {
  const { ctx, page } = await open("lead", "/curriculum");
  const panel = page.getByRole("region", { name: "Mapping to other curricula" });
  await panel.getByText("No decisions recorded.").waitFor();
  await panel.getByRole("combobox", { name: /^Objective here/ }).selectOption({ label: "SBA.M.2 · Subtract whole numbers" });
  await panel.getByRole("combobox", { name: /^Other curriculum/ }).selectOption({ index: 1 });
  await panel.getByRole("combobox", { name: /^Objective there/ }).selectOption({ label: "SBB.M.2 · Subtract whole numbers" });
  // The decision is a radio group of shared choice buttons (no native radios).
  await panel.getByRole("radio", { name: "Partly overlaps" }).check();
  await panel.getByLabel("Reason (optional)").fill("Board B stops at 100.");
  await panel.getByRole("button", { name: "Record decision" }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  await panel.getByText("Board B stops at 100.").waitFor();
  assert.equal(await raw.curriculumObjectiveMapping.count({ where: { schoolId, relation: "PARTIAL" } }), 1);
  await panel.scrollIntoViewIfNeeded();
  await shot(page, "objective-map-mapping-decision-en-1440");
  await ctx.close();
});

test("a teacher reads coverage but cannot record mapping decisions", async () => {
  const { ctx, page, errors } = await open("teacher", "/teacher/curriculum");
  await page.getByRole("listitem").filter({ hasText: "SBA.M.2" }).first().waitFor();
  await page.getByText("Only a curriculum lead can record mapping decisions.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Record decision" }).count(), 0);
  await page.getByLabel("Show").selectOption("notAssessed");
  const titles = () => page.locator('ul[aria-label="Objectives"] > li p.font-semibold').allTextContents();
  await page.waitForFunction(() => document.querySelectorAll('ul[aria-label="Objectives"] > li').length === 2);
  assert.deepEqual((await titles()).map(title => title.split(" · ")[0]), ["SBA.M.2", "SBA.M.3"], "the assessed objective is filtered out");
  await shot(page, "objective-map-teacher-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("Arabic lead and Urdu teacher layouts are RTL without overflow at 390px; codes stay left-to-right", async () => {
  for (const [key, path, title] of [["lead-ar", "/curriculum", "خريطة الأهداف"], ["teacher-ur", "/teacher/curriculum", "مقاصد کا نقشہ"]] as const) {
    const { ctx, page, errors } = await open(key, path, { width: 390, height: 860 });
    await page.getByRole("heading", { name: title }).first().waitFor();
    if (key === "teacher-ur") { await page.getByText("آپ کے مضامین کے لیے ابھی کوئی منظور شدہ نصاب نہیں", { exact: false }).waitFor(); }
    else {
      await page.locator("bdi[dir=ltr]").first().waitFor();
      assert.equal(await page.locator("div[dir=rtl]").count() > 0, true);
    }
    assert.equal(await noOverflow(page), true, key);
    await shot(page, `objective-map-${key}-390`);
    assert.deepEqual(errors, []); await ctx.close();
  }
});
