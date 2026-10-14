import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Isolated PG55438 only.");
process.env.SCHOOL_AI_STORAGE_DIR = "/private/tmp/skoolee-ai-test-documents";
const db = new PrismaClient(), origin = "http://localhost:3106", headers = { Origin: origin }, schools: string[] = [];
let schoolId = "", campusId = "", userId = "";
const restricted = "Synthetic restricted fee amounts 9876.", extraction = { text: restricted, pages: [], uncertainties: [], model: "native-utf8", tokensUsed: 0 };
test.beforeEach(async ({ context }) => {
  schoolId = `ai-source-http-${randomUUID()}`; campusId = randomUUID(); userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, name: "Synthetic source authority", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${userId}@example.invalid`, status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, role: "CAMPUS_ADMIN", fullName: "Synthetic reviewer", email: `${userId}@example.invalid`, onboardingComplete: true, mfaEnabled: true } });
  const token = await new SignJWT({ userId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${userId}@example.invalid`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
});
test.afterAll(async () => { for (const id of schools) await rm(`/private/tmp/skoolee-ai-test-documents/school-ai/${id}`, { recursive: true, force: true }); await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); });
async function prepared(page: Page) {
  const response = await page.request.post("/api/school-ai/intake", { headers, multipart: { file: { name: "synthetic-fees.txt", mimeType: "text/plain", buffer: Buffer.from(restricted) }, documentKind: "fee_sheet", language: "en", campusId } });
  expect(response.ok(), await response.text()).toBeTruthy(); const record = (await response.json()).record;
  const queued = await page.request.post(`/api/school-ai/sources/${record.id}/jobs`, { headers, data: { version: record.version, kind: "EXTRACT" } });
  expect(queued.ok(), await queued.text()).toBeTruthy(); const job = (await queued.json()).job;
  await db.schoolAiDocumentJob.update({ where: { id: job.id }, data: { status: "READY", result: extraction, version: { increment: 1 } } });
  const changed = await page.request.patch(`/api/school-ai/workspace/${record.id}`, { headers, data: { version: record.version, data: { ...record.data, documentKind: "other", extractedText: "Current public correction.", sourcePages: [] } } });
  expect(changed.ok(), await changed.text()).toBeTruthy(); return { record: (await changed.json()).record, job: { ...job, version: job.version + 1 } };
}
test("HTTP OCR history, apply, retry, extraction, retention and original download recheck historical fee access", async ({ page }) => {
  const { record, job } = await prepared(page), route = `/api/school-ai/sources/${record.id}`;
  expect((await page.request.get(`${route}/file`)).status()).toBe(200);
  expect((await (await page.request.get(`${route}/jobs`)).json()).jobs[0].result.text).toBe(restricted);
  await db.rolePermission.create({ data: { schoolId, role: "CAMPUS_ADMIN", module: "fees", canView: false, canAdd: false, canEdit: false, canDelete: false } });
  const current = await page.request.get(`/api/school-ai/workspace/${record.id}`); expect(current.status()).toBe(200); expect((await current.json()).record.data.extractedText).toBe("Current public correction.");
  for (const response of [
    await page.request.get(`${route}/file`), await page.request.get(`${route}/jobs`),
    await page.request.patch(`${route}/jobs/${job.id}`, { headers, data: { version: job.version, action: "apply", recordVersion: record.version } }),
    await page.request.patch(`${route}/jobs/${job.id}`, { headers, data: { version: job.version, action: "retry" } }),
    await page.request.post(`${route}/jobs`, { headers, data: { version: record.version, kind: "EXTRACT" } }),
    await page.request.post(`${route}/jobs`, { headers, data: { version: record.version, kind: "DELETE_ORIGINAL" } }),
  ]) { expect(response.status(), await response.text()).toBe(403); expect(await response.text()).not.toContain(restricted); }
  expect((await db.schoolAiDocumentJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("READY");
  await db.rolePermission.deleteMany({ where: { schoolId, module: "fees" } });
  expect((await page.request.get(`${route}/file`)).status()).toBe(200); expect((await page.request.get(`${route}/jobs`)).status()).toBe(200);
});
test("HTTP reviewed apply preserves original classification and job reads require the exact immutable version", async ({ page }) => {
  let { record } = await prepared(page); const route = `/api/school-ai/sources/${record.id}`, job = (await (await page.request.get(`${route}/jobs`)).json()).jobs[0];
  const denied = await page.request.patch(`${route}/jobs/${job.id}`, { headers, data: { action: "apply", version: job.version, recordVersion: record.version } });
  expect(denied.status()).toBe(409); expect((await denied.json()).error).toContain("Restore the original source category");
  const restored = await page.request.patch(`/api/school-ai/workspace/${record.id}`, { headers, data: { version: record.version, data: { ...record.data, documentKind: "fee_sheet" } } });
  expect(restored.ok(), await restored.text()).toBeTruthy(); record = (await restored.json()).record;
  const applied = await page.request.patch(`${route}/jobs/${job.id}`, { headers, data: { action: "apply", version: job.version, recordVersion: record.version } });
  expect(applied.status(), await applied.text()).toBe(200); expect((await applied.json()).record.data.extractedText).toBe(restricted);
  await db.schoolAiDocumentJob.update({ where: { id: job.id }, data: { recordVersion: 9000 } });
  const missing = await page.request.get(`${route}/jobs`); expect(missing.status()).toBe(403); expect((await missing.json()).error).toContain("retained source version");
});
