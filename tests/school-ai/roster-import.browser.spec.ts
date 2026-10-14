import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const isolated = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== isolated || process.env.DIRECT_URL !== isolated) throw new Error("Use only the isolated School AI test database.");
const db = new PrismaClient();
const school = "school-ai-browser-a", campusId = `${school}-campus`, classId = `${school}-class`;
async function signIn(context: BrowserContext, suffix = "a", role = "ADMIN") {
  const tokens = JSON.parse(await readFile("test-results/school-ai/local-tokens.json", "utf8"));
  await context.addCookies([{ name: "skoolee_token", value: tokens[`${suffix}-${role}`], url: "http://localhost:3106", httpOnly: true, sameSite: "Lax" }]);
}
test.beforeEach(async ({ context }) => { await db.user.update({ where: { id: `${school}-ADMIN` }, data: { preferredLanguage: "en" } }); await signIn(context); });
test.afterAll(async () => { await db.user.update({ where: { id: `${school}-ADMIN` }, data: { preferredLanguage: "en" } }); await db.$disconnect(); });

test("mapped roster shows duplicates and correctable omissions, commits reviewed rows once", async ({ page }) => {
  const id = `import-${Date.now()}`;
  await page.goto("/ai");
  await page.getByRole("button", { name: "Source library", exact: true }).click();
  await page.getByRole("button", { name: "Import a roster", exact: true }).click();
  await expect(page.getByRole("button", { name: "Choose CSV", exact: true })).toBeEnabled();
  const csv = `نام,رول نمبر,سرپرست کا فون,پتہ,شہر,طبی معلومات\nSynthetic Existing,QA-1,03000000000,Test Street,Test City,None reported\nSynthetic Imported,${id},03000000000,Test Street,,None reported`;
  await page.getByLabel("Choose CSV", { exact: true }).setInputFiles({ name: "synthetic-urdu.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("combobox", { name: /^Destination class/ }).selectOption(classId);
  await page.getByRole("checkbox", { name: "I checked the column mapping and destination class." }).check();
  await page.getByRole("button", { name: "Validate and preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review before creating students", exact: true })).toBeVisible();
  const duplicate = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Synthetic Existing", exact: true }) });
  await expect(duplicate.getByText("Skipped", { exact: true })).toBeVisible();
  const missing = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Synthetic Imported", exact: true }) });
  await expect(missing.getByText("Needs correction", { exact: true })).toBeVisible();
  await missing.getByRole("button", { name: "Correct row", exact: true }).click();
  await missing.getByLabel("City", { exact: false }).fill("Test City");
  await missing.getByRole("button", { name: "Save correction", exact: true }).click();
  await expect(missing.getByRole("checkbox", { name: "Include row 3" })).toBeChecked();
  await page.getByRole("checkbox", { name: "I reviewed the selected rows, exclusions and destination. Create these students now." }).check();
  await page.getByRole("button", { name: "Create selected students", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import receipt", exact: true })).toBeVisible();
  expect(await db.student.count({ where: { schoolId: school, campusId, rollNo: id } })).toBe(1);
  const batch = await db.importBatch.findFirstOrThrow({ where: { schoolId: school, sourceName: "synthetic-urdu.csv", state: "PARTIAL" }, orderBy: { createdAt: "desc" } });
  const replay = await page.request.post(`/api/students?campusId=${campusId}`, { data: { _importBatchId: batch.id } });
  expect(replay.ok(), await replay.text()).toBeTruthy(); expect((await replay.json()).idempotent).toBe(true);
  expect(await db.student.count({ where: { schoolId: school, campusId, rollNo: id } })).toBe(1);
});

test("stale review cannot change or commit a newer roster, and tenant access is denied", async ({ page, browser }) => {
  const csv = `fullName,rollNo,guardianPhone,address,city,medicalNotes\nSynthetic Race,race-${Date.now()},03000000000,Street,City,None reported`;
  const staged = await page.request.post("/api/import-batches", { data: { kind: "STUDENT_ROSTER", campusId, defaultClassId: classId, sourceName: "race.csv", csvText: csv } });
  expect(staged.ok(), await staged.text()).toBeTruthy(); const { data: batch } = await staged.json();
  const url = `/api/import-batches/${batch.id}?campusId=${campusId}`;
  expect((await page.request.patch(url, { data: { rows: [{ rowNumber: 2, selected: false }] } })).status()).toBe(409);
  expect((await page.request.post(`/api/students?campusId=${campusId}`, { data: { _importBatchId: batch.id } })).status()).toBe(409);
  const changes = await Promise.all(["One", "Two"].map(city => page.request.patch(url, { data: { reviewToken: batch.reviewToken, rows: [{ rowNumber: 2, proposal: { city } }] } })));
  expect(changes.map(response => response.status()).sort()).toEqual([200, 409]);
  expect((await page.request.post(`/api/students?campusId=${campusId}`, { data: { _importBatchId: batch.id, _reviewToken: batch.reviewToken } })).status()).toBe(409);
  const current = await (await page.request.get(url)).json(); expect(current.data.reviewToken).not.toBe(batch.reviewToken);
  expect((await page.request.patch(url, { data: { reviewToken: batch.reviewToken, rows: [{ rowNumber: 2, selected: false }] } })).status()).toBe(409);
  const other = await browser.newContext({ baseURL: "http://localhost:3106" }); await signIn(other, "b");
  expect((await other.request.get(`/api/import-batches/${batch.id}?campusId=school-ai-browser-b-campus`)).status()).toBe(404);
  await other.close();
  const teacher = await browser.newContext({ baseURL: "http://localhost:3106" }); await signIn(teacher, "a", "TEACHER");
  expect((await teacher.request.get(`/api/school-ai/imports/options?campusId=${campusId}`)).status()).toBe(403);
  await teacher.close();
});

test("a revoked permission or archived destination cannot commit a previously reviewed roster", async ({ page }) => {
  const target = await db.class.create({ data: { schoolId: school, campusId, name: `Import guards ${Date.now()}`, academicYear: 2026 } });
  const key = { schoolId: school, role: "ADMIN" as const, module: "students" };
  const previous = await db.rolePermission.findUnique({ where: { schoolId_role_module: key } });
  try {
    const staged = await page.request.post("/api/import-batches", { data: { kind: "STUDENT_ROSTER", campusId, defaultClassId: target.id, sourceName: "guards.csv", csvText: `fullName,rollNo,guardianPhone,address,city,medicalNotes\nGuard Learner,guard-${Date.now()},123,Street,City,None reported` } });
    expect(staged.ok(), await staged.text()).toBeTruthy(); const { data: batch } = await staged.json();
    await db.rolePermission.upsert({ where: { schoolId_role_module: key }, create: { ...key, canView: true, canAdd: false, canEdit: true, canDelete: true }, update: { canAdd: false } });
    const commit = () => page.request.post(`/api/students?campusId=${campusId}`, { data: { _importBatchId: batch.id, _reviewToken: batch.reviewToken } });
    expect((await commit()).status()).toBe(403);
    await db.rolePermission.update({ where: { schoolId_role_module: key }, data: { canAdd: true } });
    await db.class.update({ where: { id: target.id }, data: { status: "COMPLETED", archivedAt: new Date() } });
    expect([404, 409]).toContain((await commit()).status());
    expect(await db.student.count({ where: { classId: target.id } })).toBe(0);
    expect((await db.importBatch.findUniqueOrThrow({ where: { id: batch.id } })).state).toBe("STAGED");
  } finally {
    if (previous) await db.rolePermission.update({ where: { schoolId_role_module: key }, data: { canView: previous.canView, canAdd: previous.canAdd, canEdit: previous.canEdit, canDelete: previous.canDelete } });
    else await db.rolePermission.deleteMany({ where: key });
    await db.class.delete({ where: { id: target.id } });
  }
});

test("concurrent previews with case-variant roll numbers create only one campus identity", async ({ page }) => {
  const roll = `case-${Date.now()}`;
  const batches = await Promise.all([roll, roll.toUpperCase()].map(async rollNo => {
    const response = await page.request.post("/api/import-batches", { data: { kind: "STUDENT_ROSTER", campusId, defaultClassId: classId, sourceName: `${rollNo}.csv`, csvText: `fullName,rollNo,guardianPhone,address,city,medicalNotes\nCase Learner,${rollNo},123,Street,City,None reported` } });
    expect(response.ok(), await response.text()).toBeTruthy(); return (await response.json()).data;
  }));
  const results = await Promise.all(batches.map(batch => page.request.post(`/api/students?campusId=${campusId}`, { data: { _importBatchId: batch.id, _reviewToken: batch.reviewToken } })));
  expect(results.map(response => response.status()).sort()).toEqual([201, 409]);
  expect(await db.student.count({ where: { schoolId: school, campusId, rollNo: { equals: roll, mode: "insensitive" } } })).toBe(1);
});

test("Urdu roster mapping stays within a mobile viewport", async ({ page }) => {
  await db.user.update({ where: { id: `${school}-ADMIN` }, data: { preferredLanguage: "ur" } });
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto("/ai");
  await page.getByRole("button", { name: "ماخذ لائبریری", exact: true }).click();
  await page.getByRole("button", { name: "فہرست درآمد کریں", exact: true }).click();
  await expect(page.getByRole("button", { name: "CSV منتخب کریں", exact: true })).toBeEnabled();
  await page.getByLabel("CSV منتخب کریں", { exact: true }).setInputFiles({ name: "synthetic.csv", mimeType: "text/csv", buffer: Buffer.from("نام,رول نمبر,سرپرست کا فون,پتہ,شہر,طبی معلومات\nعلی,A1,123,گھر,کراچی,معلوم نہیں") });
  await expect(page.getByRole("heading", { name: "اپنے کالم جوڑیں", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/school-ai/roster-import-ur.png", fullPage: true });
});
