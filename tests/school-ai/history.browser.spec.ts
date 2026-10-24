import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
import { revisionCopy } from "../../src/lib/school-ai/revision-copy";
import type { AiWorkspaceRecord, WorkspaceKind } from "../../src/lib/school-ai/types";

const localDatabase = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== localDatabase || process.env.DIRECT_URL !== localDatabase) throw new Error("Use only the isolated School AI test database.");
const db = new PrismaClient(), origin = "http://localhost:3106";
const schoolId = `ai-history-${randomUUID()}`, campusId = `${schoolId}-a`, otherCampusId = `${schoolId}-b`;
const adminId = `${schoolId}-admin`, teacherId = `${schoolId}-teacher`, unrelatedId = `${schoolId}-unrelated`, studentId = `${schoolId}-student`, otherAdminId = `${schoolId}-other-admin`;
const classId = `${schoolId}-class`, subjectId = `${schoolId}-math`, otherSubjectId = `${schoolId}-science`;
const tokens = new Map<string, string>(), clients = new Map<string, APIRequestContext>();
let source: AiWorkspaceRecord, sharedSource: AiWorkspaceRecord, classifiedSource: AiWorkspaceRecord, paper: AiWorkspaceRecord;
const kindRecords = new Map<WorkspaceKind, AiWorkspaceRecord>();
const sourceData = (text: string) => ({ extractedText: text, documentKind: "other", fileName: "history.txt", mimeType: "text/plain", origin: "manual", extractionStatus: "manual", uncertainties: [] });
const admin = () => clients.get(adminId)!;
async function create(kind: WorkspaceKind, title: string, data: Record<string, unknown>) {
  const response = await admin().post("/api/school-ai/workspace", { data: { kind, title, campusId, data, idempotencyKey: randomUUID() } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).record as AiWorkspaceRecord;
}
async function update(record: AiWorkspaceRecord, change: Record<string, unknown>) {
  const response = await admin().patch(`/api/school-ai/workspace/${record.id}`, { data: { version: record.version, ...change } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).record as AiWorkspaceRecord;
}
async function inspect(page: Page, record: AiWorkspaceRecord, language: "en" | "ar" | "ur" = "en") {
  await page.goto("/ai");
  await page.getByRole("button", { name: schoolAICopy(language).history, exact: true }).click();
  await page.getByRole("combobox", { name: revisionCopy(language).choose, exact: true }).selectOption(record.id);
  await expect(page.getByRole("combobox", { name: revisionCopy(language).selectedVersion, exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic revision academy", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.test`, registrationKind: "GROUP", status: "ACTIVE", plan: "PRO" } });
  for (const id of [campusId, otherCampusId]) await db.campus.create({ data: { id, schoolId, name: id === campusId ? "Revision campus" : "Other revision campus", city: "Test", regId: id } });
  for (const [id, role, campus] of [[adminId, "ADMIN", campusId], [teacherId, "TEACHER", campusId], [unrelatedId, "TEACHER", campusId], [studentId, "STUDENT", campusId], [otherAdminId, "ADMIN", otherCampusId]] as const) {
    await db.user.create({ data: { id, role, schoolId, campusId: campus, email: `${id}@example.test`, fullName: id === adminId ? "History reviewer" : `Synthetic ${role}`, mfaEnabled: true, isActive: true, onboardingComplete: true } });
    const token = await new SignJWT({ userId: id, schoolId, campusId: campus, role, email: `${id}@example.test`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
    await db.loginSession.create({ data: { userId: id, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
    tokens.set(id, token);
    clients.set(id, await request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin, Cookie: `skoolee_token=${token}` } }));
  }
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", academicYear: 2026, teachingMode: "SUBJECT" } });
  await db.subject.createMany({ data: [{ id: subjectId, schoolId, campusId, classId, teacherId, name: "Mathematics" }, { id: otherSubjectId, schoolId, campusId, classId, teacherId: unrelatedId, name: "Science" }] });
  source = await create("SOURCE", "Reviewed source history", sourceData("Original source text"));
  source = await update(source, { action: "save", data: sourceData("Previously reviewed source text") });
  source = await update(source, { action: "approve" });
  source = await update(source, { action: "save", data: sourceData("Latest source correction") });
  kindRecords.set("SOURCE", source);
  sharedSource = await create("SOURCE", "Scoped shared source", { ...sourceData("Unpublished secret first draft"), subjectId, classId });
  sharedSource = await update(sharedSource, { action: "approve" });
  sharedSource = await update(sharedSource, { action: "save", data: { ...sharedSource.data, extractedText: "Unpublished secret second draft" } });
  sharedSource = await update(sharedSource, { action: "approve" });
  classifiedSource = await create("SOURCE", "Reclassified source", { ...sourceData("Old restricted fee details"), documentKind: "fee_sheet" });
  classifiedSource = await update(classifiedSource, { action: "save", data: sourceData("Current general source") });
  kindRecords.set("ONBOARDING", await create("ONBOARDING", "School facts history", { path: "new", answers: { schoolName: "Synthetic fact" }, confirmedKeys: [], step: "profile" }));
  kindRecords.set("POLICY", await create("POLICY", "Policy history", { mode: "approval_required", instructions: "Require a human review", scope: "academics", requiresApproval: true }));
  kindRecords.set("WORKFLOW", await create("WORKFLOW", "Workflow history", { goal: "Review the next academic step", steps: [{ id: "review", title: "Review evidence", status: "ready" }], sourceIds: [], missingInformation: [] }));
  let curriculum = await create("CURRICULUM", "Curriculum history", { subjectId, classId, academicYear: "2026", board: "Synthetic curriculum", sources: [{ id: "syllabus", title: "Approved syllabus", kind: "SYLLABUS", reference: "Page 1", excerpt: "Compare integers", approved: true }], outcomes: [{ id: "integers", title: "Compare integers", sourceId: "syllabus", sourcePage: "1", taught: true, included: true }] });
  curriculum = await update(curriculum, { action: "approve" }); kindRecords.set("CURRICULUM", curriculum);
  paper = await create("PAPER", "Staff answer-key history", { curriculumId: curriculum.id, curriculumVersion: curriculum.version, subjectId, classId, language: "en", blueprint: { title: "Integer comparison", durationMinutes: 20, totalMarks: 1, instructions: "Answer the question", sections: [{ id: "section", title: "Short answer", questionCount: 1, answerCount: 1, marksPerQuestion: 1, type: "SHORT_TEXT", outcomeIds: ["integers"] }] }, questions: [{ id: "q1", sectionId: "section", type: "SHORT_TEXT", prompt: "Which is larger, 3 or 5?", marks: 1, options: [], correctOptionId: null, modelAnswer: "Private staff answer: five", rubric: [{ id: "r1", criterion: "Correct comparison", marks: 1 }], outcomeIds: ["integers"], sourceRefs: [{ sourceId: "syllabus", page: "1", excerpt: "Compare integers" }], locked: false }], generation: { kind: "MANUAL", model: null, generatedAt: null } });
  kindRecords.set("PAPER", paper);
});
test.afterAll(async () => {
  await Promise.all([...clients.values()].map(client => client.dispose()));
  await db.school.deleteMany({ where: { id: schoolId } });
  await db.$disconnect();
});
test.beforeEach(async ({ context }) => {
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: "en" } });
  await context.addCookies([{ name: "skoolee_token", value: tokens.get(adminId)!, url: origin, httpOnly: true, sameSite: "Lax" }]);
});

test("saved source comparison exposes exact audit evidence, requires review and restores as a new draft", async ({ page }) => {
  const h = revisionCopy("en");
  await inspect(page, source);
  await expect(page.locator("dd").filter({ hasText: /^History reviewer$/ })).toBeVisible();
  await expect(page.getByText("Previously reviewed source text", { exact: true })).toBeVisible();
  await expect(page.getByText("Latest source correction", { exact: true })).toBeVisible();
  await expect(page.locator("time[datetime]")).toBeVisible();
  await expect(page.getByText("Source text version 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: h.approveCurrent, exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: h.reviewConfirm, exact: true }).check();
  await page.getByRole("button", { name: h.approveCurrent, exact: true }).click();
  await expect(page.getByRole("combobox", { name: h.selectedVersion, exact: true })).toHaveValue("5");
  await page.getByRole("combobox", { name: h.selectedVersion, exact: true }).selectOption("1");
  await expect(page.getByText("Original source text", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: h.restore, exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: h.restoreTitle, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: h.restore, exact: true }).click();
  await expect(page.getByRole("combobox", { name: h.selectedVersion, exact: true })).toHaveValue("6");
  const stored = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: source.id } });
  expect(stored.status).toBe("DRAFT"); expect((stored.data as Record<string, unknown>).extractedText).toBe("Original source text");
  const approved = await db.schoolAiRevision.findMany({ where: { recordId: source.id, status: "APPROVED" }, orderBy: { version: "asc" } });
  expect(approved.map(row => row.version)).toEqual([3, 5]);
  expect((approved[0].data as Record<string, unknown>).extractedText).toBe("Previously reviewed source text");
  expect((approved[1].data as Record<string, unknown>).extractedText).toBe("Latest source correction");
  expect(await db.schoolAiExecution.count({ where: { schoolId } })).toBe(0);
});

test("an intervening save blocks restoration instead of overwriting the newer current record", async ({ page }) => {
  const h = revisionCopy("en");
  let conflict = await create("SOURCE", "Concurrent history", sourceData("Earlier conflict snapshot"));
  conflict = await update(conflict, { action: "save", data: sourceData("Current conflict snapshot") });
  await inspect(page, conflict);
  await page.getByRole("combobox", { name: h.selectedVersion, exact: true }).selectOption("1");
  await expect(page.getByRole("button", { name: h.restore, exact: true })).toBeVisible();
  const newer = await update(conflict, { action: "save", data: sourceData("A concurrent staff correction") });
  await page.getByRole("button", { name: h.restore, exact: true }).click();
  await page.getByRole("alertdialog", { name: h.restoreTitle, exact: true }).getByRole("button", { name: h.restore, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: schoolAICopy("en").conflict })).toBeVisible();
  const stored = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: conflict.id } });
  expect(stored.version).toBe(newer.version); expect((stored.data as Record<string, unknown>).extractedText).toBe("A concurrent staff correction");
});

test("all six record kinds have readable saved snapshots and authorized staff can inspect answer keys", async ({ page }) => {
  const h = revisionCopy("en");
  await inspect(page, paper);
  for (const record of kindRecords.values()) await expect(page.getByRole("combobox", { name: h.choose, exact: true }).locator(`option[value="${record.id}"]`)).toHaveCount(1);
  await page.getByRole("button", { name: h.snapshot, exact: true }).click();
  const snapshot = page.getByRole("region", { name: h.snapshot, exact: true });
  while (await snapshot.getByRole("button", { name: h.moreChanges, exact: true }).count()) await snapshot.getByRole("button", { name: h.moreChanges, exact: true }).click();
  await expect(snapshot.getByText("Private staff answer: five", { exact: true })).toBeVisible();
  await expect(page.getByText(h.staffPaper, { exact: true })).toBeVisible();
  for (const kind of ["ONBOARDING", "POLICY", "WORKFLOW", "CURRICULUM"] as const) {
    await page.getByRole("combobox", { name: h.choose, exact: true }).selectOption(kindRecords.get(kind)!.id);
    await expect(page.getByRole("heading", { name: kindRecords.get(kind)!.title, exact: true })).toBeVisible();
  }
});

test("revision APIs enforce teacher, campus, candidate and historical domain boundaries", async () => {
  const teacher = clients.get(teacherId)!;
  const response = await teacher.get(`/api/school-ai/workspace/${sharedSource.id}?history=summary`);
  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = await response.json();
  expect(payload.revisions.map((row: { version: number }) => row.version)).toEqual([4, 2]);
  expect(payload.historyAccess).toEqual({ canRestore: false, canApprove: false });
  expect(payload.revisions.every((row: Record<string, unknown>) => !Object.hasOwn(row, "data"))).toBe(true);
  for (const version of [1, 3]) expect((await teacher.get(`/api/school-ai/workspace/${sharedSource.id}?revision=${version}`)).status()).toBe(404);
  expect((await clients.get(unrelatedId)!.get(`/api/school-ai/workspace/${sharedSource.id}?history=summary`)).status()).toBe(404);
  expect((await clients.get(otherAdminId)!.get(`/api/school-ai/workspace/${source.id}?history=summary`)).status()).toBe(404);
  for (const actor of [studentId, teacherId, unrelatedId]) {
    const denied = await clients.get(actor)!.get(`/api/school-ai/workspace/${paper.id}?revision=1`);
    expect([403, 404]).toContain(denied.status()); expect(await denied.text()).not.toContain("Private staff answer");
  }
  await db.rolePermission.create({ data: { schoolId, role: "ADMIN", module: "fees", canView: false, canAdd: false, canEdit: false, canDelete: false } });
  const filtered = await admin().get(`/api/school-ai/workspace/${classifiedSource.id}?history=summary`);
  expect(filtered.ok(), await filtered.text()).toBeTruthy();
  expect((await filtered.json()).revisions.map((row: { version: number }) => row.version)).toEqual([2]);
  const denied = await admin().get(`/api/school-ai/workspace/${classifiedSource.id}?revision=1`);
  expect(denied.status()).toBe(404); expect(await denied.text()).not.toContain("Old restricted fee details");
});

test("metadata history pages are bounded and exact snapshots remain independently accessible", async ({ page }) => {
  let record = await create("POLICY", "Long policy history", { mode: "approval_required", instructions: "Policy revision 1", scope: "academics", requiresApproval: true });
  for (let version = 2; version <= 23; version++) record = await update(record, { action: "save", data: { ...record.data, instructions: `Policy revision ${version}` } });
  const first = await (await admin().get(`/api/school-ai/workspace/${record.id}?history=summary`)).json();
  expect(first.revisions).toHaveLength(20); expect(first.nextVersion).toBe(4);
  expect(first.revisions.every((row: Record<string, unknown>) => !Object.hasOwn(row, "data") && row.actorName === "History reviewer")).toBe(true);
  const second = await (await admin().get(`/api/school-ai/workspace/${record.id}?history=summary&beforeVersion=4`)).json();
  expect(second.revisions.map((row: { version: number }) => row.version)).toEqual([3, 2, 1]); expect(second.nextVersion).toBeNull();
  const selected = await admin().get(`/api/school-ai/workspace/${record.id}?revision=7`);
  expect((await selected.json()).revision.data.instructions).toBe("Policy revision 7"); expect(selected.headers()["cache-control"]).toBe("private, no-store");
  for (const query of ["revision=0", "revision=1x", "beforeVersion=0&history=summary"]) expect((await admin().get(`/api/school-ai/workspace/${record.id}?${query}`)).status()).toBe(400);
  await inspect(page, record);
  await page.getByRole("button", { name: revisionCopy("en").moreHistory, exact: true }).click();
  await page.getByRole("combobox", { name: revisionCopy("en").selectedVersion, exact: true }).selectOption("1");
  await expect(page.getByText("Policy revision 1", { exact: true })).toBeVisible();
});

for (const language of ["ar", "ur"] as const) test(`${language} revision comparison fits mobile and retains translated accessible controls`, async ({ page }) => {
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: language } });
  await page.setViewportSize({ width: 360, height: 800 });
  await inspect(page, source, language);
  const h = revisionCopy(language);
  await expect(page.getByRole("button", { name: h.comparison, exact: true })).toBeVisible();
  await expect(page.getByText(h.actor, { exact: true })).toBeVisible();
  const geometry = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, dir: document.documentElement.dir }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); expect(geometry.dir).toBe("rtl");
});
