import { captureEvidence } from "./screenshot-evidence";
import { test, expect, type BrowserContext, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { resetDemoTenant, DEMO_SCHOOL_ID } from "../../scripts/demo/reset-demo-tenant";

/**
 * SKO-501 (Exam Studio slice 2) on the synthetic demo tenant, loopback database only:
 * the head moderates and signs from the teacher home; the principal seals from the Papers step and prints
 * the sealed paper (footer prefix = seal); an edit after sealing blocks printing and reads CHANGED_AFTER_APPROVAL.
 * Run: SCHOOL_AI_TEST_ORIGIN=… DATABASE_URL=… DEMO_PASSWORD=… npx playwright test --config tests/school-ai/playwright.sko501.config.ts
 */
const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Use only a loopback database for this suite.");
const password = process.env.DEMO_PASSWORD ?? "";
const shots = process.env.SKO501_SHOTS;
const origin = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";
const db = new PrismaClient();
const headers = { Origin: origin };

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { await resetDemoTenant(db, password); await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID }, data: { preferredLanguage: "en" } }); });
test.afterAll(async () => { await db.$disconnect(); });

async function signIn(context: BrowserContext, email: string) {
  const response = await context.request.post("/api/auth/login", { data: { email, password }, headers });
  expect(response.ok()).toBeTruthy();
  if ((await response.json()).mfaRequired) expect((await context.request.post("/api/auth/mfa", { data: { action: "defer" }, headers })).ok()).toBeTruthy();
}
async function paper(id: string) { return db.schoolAiRecord.findUniqueOrThrow({ where: { id }, select: { version: true, data: true } }); }

let slotId = "", paperId = "";
test("office requests, author writes and sends the paper for review", async ({ browser }) => {
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  const session = await db.examSession.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } });
  expect((await office.request.post(`/api/academic/exam-sessions/${session.id}/paper-slots`, { headers, data: {} })).ok()).toBeTruthy();
  const slot = await db.examPaperSlot.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } }); slotId = slot.id;
  await db.examPaperSlot.update({ where: { id: slotId }, data: { totalMarks: 5, durationMinutes: 20 } });
  await office.close();
  const author = await browser.newContext(); await signIn(author, "demo-teacher@example.invalid");
  const source = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, kind: "PAPER" }, orderBy: { createdAt: "asc" } });
  const created = await author.request.post("/api/school-ai/workspace", { headers, data: { kind: "PAPER", title: "Science Grade 7 mid-term", idempotencyKey: `s2-${Date.now()}`, data: { ...(source.data as object), slotId, examType: "MID_TERM" } } });
  expect(created.status()).toBe(201); paperId = (await created.json()).record.id;
  for (const question of ((await paper(paperId)).data as { questions: Array<{ id: string }> }).questions) {
    expect((await author.request.post(`/api/school-ai/workspace/${paperId}/item-review`, { headers, data: { version: (await paper(paperId)).version, questionId: question.id, target: "READY_FOR_REVIEW", itemRevision: 1 } })).ok()).toBeTruthy();
  }
  expect((await author.request.patch(`/api/school-ai/workspace/${paperId}`, { headers, data: { version: (await paper(paperId)).version, action: "review" } })).ok()).toBeTruthy();
  await author.close();
});

test("the head moderates from the teacher home and signs", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await signIn(context, "demo-hod@example.invalid");
  const page = await context.newPage();
  await page.goto("/teacher");
  const queue = page.locator("[data-moderation-queue]");
  await expect(queue).toBeVisible();
  if (await page.locator("[data-guide-scroll]").count()) await page.keyboard.press("Escape");
  await queue.getByRole("button", { name: "Moderate" }).dispatchEvent("click");
  const panel = page.locator("[data-moderation-panel]");
  await expect(panel.locator("[data-check]")).toHaveCount(8);
  await expect(panel.locator('[data-check][data-ok="false"]')).toHaveCount(0);
  if (shots) await captureEvidence(panel, { path: `${shots}/hod-moderation.png` });
  await panel.locator('[data-moderation="sign"]').dispatchEvent("click");
  await expect(panel).toContainText("Signed");
  const decision = await db.examPaperModeration.findFirstOrThrow({ where: { slotId }, select: { decision: true } });
  expect(decision.decision).toBe("SIGNED");
  await context.close();
});

test("the principal seals from the Papers step and prints the sealed paper; an edit then blocks printing", async ({ browser }) => {
  const author = await browser.newContext(); await signIn(author, "demo-teacher@example.invalid");
  expect((await author.request.post(`/api/school-ai/workspace/${paperId}/rehearsal`, { headers, data: { version: (await paper(paperId)).version, findings: [] } })).ok()).toBeTruthy();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await signIn(context, "demo-principal@example.invalid");
  const page = await context.newPage();
  // Seeded provider evidence exercises the real policy, API and UI; no provider response is mocked.
  test.info().annotations.push({ type: "FIXTURE", description: "Persisted synthetic solver disagreement and subsequent clear recheck; this fixture does not validate live-provider quality." });
  const checked = await paper(paperId);
  const questionId = (checked.data as { questions: Array<{ id: string }> }).questions[0].id;
  const actor = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-teacher@example.invalid" }, select: { id: true, campusId: true } });
  const evidence = { schoolId: DEMO_SCHOOL_ID, campusId: actor.campusId, userId: actor.id, feature: "SCHOOL_AI_PAPER_SEMANTICS", action: "SYNTHETIC_AUDIT_EVIDENCE", metadata: { recordId: paperId, recordVersion: checked.version } };
  await db.aIUsageLog.create({ data: { ...evidence, createdAt: new Date(Date.now() - 1000), output: { findings: [], checks: [{ questionId, independentAnswer: "Synthetic review fixture", consistent: false, reason: "Synthetic audit finding: the answer needs independent review." }] } } });
  const blocked = await context.request.post(`/api/academic/paper-slots/${slotId}/seal`, { headers, data: { paperVersion: checked.version } });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).code).toBe("SOLVER_DISAGREEMENT");
  expect((await db.examPaperSlot.findUniqueOrThrow({ where: { id: slotId } })).sealedAt).toBeNull();
  await page.goto("/ai/studio#space=review");
  const review = page.locator("[data-review-desk]");
  await review.locator("select").first().selectOption(paperId);
  await expect(review.locator('[data-blocker="SOLVER_DISAGREEMENT"]')).toBeVisible();
  await expect(review.locator("[data-solver-findings]")).toContainText("Create & review");
  if (shots) await captureEvidence(review.locator("[data-solver-findings]"), { path: `${shots}/synthetic-solver-disagreement-blocks-seal.png` });
  await db.aIUsageLog.create({ data: { ...evidence, output: { findings: [], checks: [{ questionId, independentAnswer: "Synthetic review fixture", consistent: true, reason: "Synthetic audit recheck: no disagreement remains." }] } } });
  await page.reload();
  await review.locator("select").first().selectOption(paperId);
  await expect(review.locator('[data-blocker="SOLVER_DISAGREEMENT"]')).toHaveCount(0);
  await page.goto("/principal?view=exam-cycles");
  await page.getByRole("button", { name: /Papers/ }).first().click();
  const step = page.locator("[data-papers-step]");
  await step.locator("[data-seal-slot]").click();
  const sheet = page.locator("[data-seal-sheet]");
  await expect(sheet).toContainText("#");
  if (shots) await captureEvidence(sheet, { path: `${shots}/principal-seal-sheet.png` });
  await page.getByRole("button", { name: "Seal paper" }).click();
  await expect(step.locator('[data-slot-status="SEALED"]')).toHaveCount(1);
  const slot = await db.examPaperSlot.findUniqueOrThrow({ where: { id: slotId }, select: { sealHash: true } });
  const print = await context.request.get(`/api/academic/paper-slots/${slotId}/print`);
  expect(print.status()).toBe(200);
  expect(await print.text()).toContain(slot.sealHash!.slice(0, 16));
  if (shots) {
    const printed = await context.newPage();
    await printed.goto(`/api/academic/paper-slots/${slotId}/print`);
    await expect(printed.locator("body")).toContainText(slot.sealHash!.slice(0, 16));
    await captureEvidence(printed, { path: `${shots}/office-sealed-print.png`, fullPage: true });
    await printed.close();
  }
  // A corrigendum is recorded against the seal and shown to read out in every room.
  expect((await context.request.post(`/api/academic/paper-slots/${slotId}/corrigendum`, { headers, data: { text: "Question 2: write two things, not three." } })).ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: /Papers/ }).first().click();
  await expect(page.locator("[data-corrigenda]")).toContainText("Question 2");
  if (shots) await captureEvidence(step, { path: `${shots}/principal-sealed.png` });
  const current = await paper(paperId);
  const data = current.data as { questions: Array<{ prompt: string }> };
  data.questions[0].prompt += " (edited)";
  expect((await author.request.patch(`/api/school-ai/workspace/${paperId}`, { headers, data: { version: current.version, action: "save", data } })).ok()).toBeTruthy();
  expect((await context.request.get(`/api/academic/paper-slots/${slotId}/print`)).status()).toBe(409);
  await page.reload();
  await page.getByRole("button", { name: /Papers/ }).first().click();
  await expect(page.locator('[data-slot-status="CHANGED_AFTER_APPROVAL"]')).toHaveCount(1);
  if (shots) await captureEvidence(step, { path: `${shots}/changed-paper-print-blocked.png` });
  await author.close(); await context.close();
});

test("the author uploads an actual text paper and receives draft questions for review", async ({ browser }) => {
  await resetDemoTenant(db, password);
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  const session = await db.examSession.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } });
  expect((await office.request.post(`/api/academic/exam-sessions/${session.id}/paper-slots`, { headers, data: {} })).ok()).toBeTruthy();
  await office.close();
  const author = await browser.newContext(); await signIn(author, "demo-teacher@example.invalid");
  const page = await author.newPage();
  await page.goto("/ai/studio#space=brief");
  await page.locator("select").filter({ hasText: "Mathematics" }).first().selectOption({ label: "Grade 7 · A · Science" });
  await page.locator("[data-upload-own]").first().click();
  const upload = page.locator("[data-upload-paper]");
  await upload.locator('input[type="file"]').setInputFiles({
    name: "synthetic-science-paper.txt", mimeType: "text/plain",
    buffer: Buffer.from("Grade 7 Science\n1. Which gas do plants take in? [2]\na) Carbon dioxide\nb) Oxygen\n2. Name two inputs for photosynthesis. [3]\nAnswers:\n1. a\n2. Light and water"),
  });
  if (shots) await captureEvidence(upload, { path: `${shots}/teacher-upload-paper.png` });
  await upload.locator("[data-upload-read]").click();
  await expect(upload.locator("[data-upload-source]")).toBeVisible();
  await expect(upload.locator("[data-upload-continue]")).toBeDisabled();
  await upload.locator("[data-upload-reviewed]").check();
  await upload.locator("[data-upload-save-review]").click();
  await expect(upload.locator("[data-upload-continue]")).toBeEnabled();
  await upload.locator("[data-upload-continue]").click();
  await expect(page.locator("[data-upload-result]")).toBeVisible();
  if (shots) await captureEvidence(page.locator("[data-upload-result]"), { path: `${shots}/teacher-upload-review-ready.png` });
  const slot = await db.examPaperSlot.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } });
  const uploaded = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: slot.paperRecordId! } });
  expect(uploaded.status).toBe("DRAFT");
  const data = uploaded.data as { generation: { kind: string }; questions: Array<{ prompt: string }> };
  expect(data.generation.kind).toBe("UPLOADED");
  expect(data.questions).toHaveLength(2);
  expect(data.questions[0].prompt).toContain("Which gas");
  await author.close();
});


test("synthetic scan lifecycle resumes a saved source through queued, failed and reviewed extraction without another intake", async ({ browser }) => {
  test.info().annotations.push({ type: "FIXTURE", description: "A one-pixel PNG and persisted synthetic document-job states exercise recovery, review and import. No extraction model is called; OCR quality is not validated." });
  await resetDemoTenant(db, password);
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  const session = await db.examSession.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } });
  expect((await office.request.post(`/api/academic/exam-sessions/${session.id}/paper-slots`, { headers, data: {} })).ok()).toBeTruthy();
  await office.close();
  const author = await browser.newContext(); await signIn(author, "demo-teacher@example.invalid");
  const actor = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-teacher@example.invalid" } });
  const page = await author.newPage();
  let intakes = 0, imports = 0, sourceId = "", sourceVersion = 0, importedVersion = 0, jobId = "";
  page.on("request", request => {
    if (request.method() === "POST" && request.url().endsWith("/api/school-ai/intake")) intakes += 1;
    if (request.method() === "POST" && request.url().endsWith("/paper-from-upload")) { imports += 1; importedVersion = request.postDataJSON().expectedSourceVersion; }
  });
  // The real intake saves its original. Only downstream extraction states are synthetic.
  // A future schedule also ensures this fixture is never picked up by a document worker.
  await page.route("**/api/school-ai/intake", async route => {
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    sourceId = payload.record.id; sourceVersion = payload.record.version;
    const job = await db.schoolAiDocumentJob.upsert({
      where: { recordId_recordVersion_kind: { recordId: sourceId, recordVersion: sourceVersion, kind: "EXTRACT" } },
      create: { schoolId: DEMO_SCHOOL_ID, campusId: actor.campusId, recordId: sourceId, recordVersion: sourceVersion, kind: "EXTRACT", actorId: actor.id, actorRole: actor.role, accessVersion: actor.accessVersion, scheduledAt: new Date("2099-01-01T00:00:00Z") },
      update: { status: "QUEUED", scheduledAt: new Date("2099-01-01T00:00:00Z") },
    });
    jobId = job.id;
    await route.fulfill({ response });
  });
  const openUpload = async () => {
    await page.goto("/ai/studio#space=brief");
    await page.locator("select").filter({ hasText: "Mathematics" }).first().selectOption({ label: "Grade 7 · A · Science" });
    await page.locator("[data-upload-own]").first().click();
  };
  await openUpload();
  const upload = page.locator("[data-upload-paper]");
  await upload.locator('input[type="file"]').setInputFiles({ name: "synthetic-no-model-science-scan.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64") });
  await upload.locator("[data-upload-read]").click();
  const jobs = upload.getByRole("region", { name: "Document processing and retention" });
  await expect(jobs).toContainText("Queued");
  await expect(upload.locator("[data-upload-continue]")).toBeDisabled();
  expect(imports).toBe(0);
  if (shots) await captureEvidence(jobs.locator("article").first(), { path: `${shots}/synthetic-scan-upload-queued.png` });
  await db.schoolAiDocumentJob.update({ where: { id: jobId }, data: { status: "FAILED", errorCode: "AI_QUOTA_EXHAUSTED", attempts: 1, version: { increment: 1 } } });
  await jobs.getByRole("button", { name: "Refresh progress" }).click();
  await expect(jobs).toContainText("Needs attention");
  await expect(jobs).toContainText("out of credits");
  await expect(upload.locator("[data-upload-source]")).toHaveAttribute("data-upload-source", sourceId);
  if (shots) await captureEvidence(jobs.locator("article").first(), { path: `${shots}/synthetic-scan-upload-needs-attention.png` });
  await page.reload();
  await openUpload();
  await expect(upload.locator("[data-upload-source]")).toHaveAttribute("data-upload-source", sourceId);
  await expect(jobs).toContainText("out of credits");
  expect(intakes).toBe(1); expect(imports).toBe(0);
  const extractedText = "Synthetic extraction fixture — model not called\n1. Which gas do plants take in? [2]\na) Carbon dioxide\nb) Oxygen\n2. Name two inputs for photosynthesis. [3]\nAnswers:\n1. a\n2. Light and water";
  await db.schoolAiDocumentJob.update({ where: { id: jobId }, data: { status: "READY", errorCode: null, version: { increment: 1 }, result: { text: extractedText, pages: [{ page: 1, text: extractedText, reviewed: false, regions: [] }], expectedPageCount: 1, structureReviewed: false, missingPages: [], uncertainties: [], model: "synthetic-no-provider-call", tokensUsed: 0 } } });
  await jobs.getByRole("button", { name: "Refresh progress" }).click();
  await expect(jobs).toContainText("Ready to review");
  await expect(upload.getByLabel("Paper text to review", { exact: true })).toHaveValue("");
  await expect(upload.locator("[data-upload-continue]")).toBeDisabled();
  if (shots) await captureEvidence(jobs.locator("article").first(), { path: `${shots}/synthetic-scan-extraction-review.png` });
  // A slow apply must lock manual edits and Start over until its saved source arrives.
  let releaseApply: (() => void) | undefined, applyReceived = false;
  const applyHold = new Promise<void>(resolve => { releaseApply = resolve; });
  await page.route(`**/api/school-ai/sources/${sourceId}/jobs/${jobId}`, async route => {
    const response = await route.fetch(); applyReceived = true; await applyHold; await route.fulfill({ response });
  });
  await jobs.getByLabel("I reviewed the extracted text and want it saved as a new draft.").check();
  await jobs.getByRole("button", { name: "Apply reviewed extraction" }).click();
  await expect.poll(() => applyReceived).toBe(true);
  await expect(upload.getByLabel("Paper text to review", { exact: true })).toBeDisabled();
  await expect(upload.locator("[data-upload-start-over]")).toBeDisabled();
  releaseApply?.();
  await expect(upload.getByLabel("Paper text to review", { exact: true })).toHaveValue(extractedText);
  await expect(jobs).toContainText("Applied as draft");
  expect(imports).toBe(0);
  await expect(upload.locator("[data-upload-reviewed]")).toBeDisabled();
  await upload.getByLabel("I checked this page against the original", { exact: true }).check();
  await upload.getByRole("button", { name: "Use corrected page text as source text" }).click();
  await upload.getByLabel("I checked every physical page and resolved all required regions", { exact: true }).check();
  await upload.locator("[data-upload-reviewed]").check();
  await upload.locator("[data-upload-save-review]").click();
  await expect(upload.locator("[data-upload-continue]")).toBeEnabled();
  const reviewedSource = await paper(sourceId);
  expect(reviewedSource.version).toBeGreaterThan(sourceVersion);
  if (shots) {
    await upload.locator("[data-upload-continue]").scrollIntoViewIfNeeded();
    await captureEvidence(page, { path: `${shots}/synthetic-scan-source-reviewed.png`, fullPage: false });
  }
  await upload.locator("[data-upload-continue]").click();
  await expect(page.locator("[data-upload-result]")).toContainText("2 questions read");
  expect(intakes).toBe(1); expect(imports).toBe(1); expect(importedVersion).toBe(reviewedSource.version);
  expect(await db.schoolAiDocumentJob.count({ where: { recordId: sourceId, kind: "EXTRACT" } })).toBe(1);
  expect(await db.schoolAiRecord.count({ where: { schoolId: DEMO_SCHOOL_ID, kind: "SOURCE", title: "synthetic-no-model-science-scan.png" } })).toBe(1);
  const slot = await db.examPaperSlot.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } });
  expect(slot.paperRecordId).toBeTruthy();
  await author.close();
});
