import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-401 on the isolated app with synthetic records: search covers only the reader's school, campus and
// (for teachers) classes, before counting; exact identifiers rank first and survive a name change; Arabic
// spelling variants match; archived and merged records need an explicit filter or open the surviving record;
// a revoked permission removes a record type on the next search; the URL restores the search; an older
// response never overwrites a newer one; families cannot use it.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.SEARCH_TEST_APP || "http://localhost:3107";
const evidence = process.env.SEARCH_EVIDENCE_DIR || "/tmp/sko401-evidence";
const db = new PrismaClient(), password = "SyntheticSearch401!";
const schoolId = `search401-${randomUUID()}`, campusA = randomUUID(), campusB = randomUUID();
const class7 = randomUUID(), class8 = randomUUID(), class7old = randomUUID(), classB = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const pupils: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, campus: string | null = campusA, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
type Data = { allowedTypes: string[]; groups: { type: string; total: number; rows: { id: string; title: string; exact: boolean; archived: boolean; note?: string; context: string[]; identifiers: string[]; href: string }[] }[]; partial: boolean };
const search = async (ctx: BrowserContext, query: Record<string, string>) => {
  const response = await ctx.request.get(`${base}/api/search?${new URLSearchParams(query)}`);
  return { status: response.status(), data: (await response.json()).data as Data };
};
const students = (data: Data) => data.groups.find(group => group.type === "student") ?? { total: 0, rows: [] };
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cypress Search School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [id, name] of [[campusA, "Cypress North"], [campusB, "Cypress South"]]) await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Lahore" } });
  await user("lead", "PRINCIPAL"); await user("leadB", "PRINCIPAL", campusB); await user("owner", "SUPER_ADMIN", null); const teacher = await user("teacher", "TEACHER");
  await user("desk", "RECEPTIONIST"); await user("parent", "PARENT"); await user("lead-ar", "PRINCIPAL", campusA, "ar");
  await db.class.create({ data: { id: class7, schoolId, campusId: campusA, name: "Grade 7", section: "B", academicYear: 2026, classTeacherId: teacher } });
  await db.class.create({ data: { id: class8, schoolId, campusId: campusA, name: "Grade 8", section: "A", academicYear: 2026 } });
  await db.class.create({ data: { id: class7old, schoolId, campusId: campusA, name: "Grade 7", section: "B", academicYear: 2025 } });
  await db.class.create({ data: { id: classB, schoolId, campusId: campusB, name: "Grade 7", section: "B", academicYear: 2026 } });
  const pupil = async (key: string, data: Record<string, unknown>) => { const id = randomUUID(); pupils[key] = id; await db.student.create({ data: { id, schoolId, gender: "MALE", enrollmentDate: new Date("2025-04-01Z"), ...data } as never }); };
  await pupil("ahmadA", { campusId: campusA, classId: class7, fullName: "Synthetic Ahmad Raza", rollNo: "N-701", admissionNo: "ADM-2026-NORTH-0001" });
  await pupil("ahmadB", { campusId: campusB, classId: classB, fullName: "Synthetic Ahmad Raza", rollNo: "S-701", admissionNo: "ADM-2026-SOUTH-0001" });
  await pupil("arabic", { campusId: campusA, classId: class8, fullName: "أَحمد سليم", rollNo: "N-801" });
  await pupil("archived", { campusId: campusA, classId: class7old, fullName: "Synthetic Former Pupil Zara", rollNo: "N-799", archivedAt: new Date("2026-01-10Z"), status: "archived" });
  for (let i = 0; i < 30; i++) await pupil(`bulk${i}`, { campusId: campusA, classId: class8, fullName: `Synthetic Bulk Pupil ${String(i).padStart(2, "0")}`, rollNo: `N-9${String(i).padStart(2, "0")}` });
  await pupil("survivor", { campusId: campusA, classId: class8, fullName: "Synthetic Survivor Hina", rollNo: "N-850", admissionNo: "ADM-2026-NORTH-0850" });
  await pupil("alias", { campusId: campusA, classId: class8, fullName: "Synthetic Hina (duplicate)", rollNo: "N-851", admissionNo: "ADM-2025-OLD-0851", consolidatedIntoId: pupils.survivor, archivedAt: new Date("2026-02-01Z"), status: "consolidated" });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.student.updateMany({ where: { schoolId }, data: { consolidatedIntoId: null } }).catch(() => undefined); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("same-name pupils stay in their campus; an exact identifier ranks first and survives a name change", async () => {
  const lead = await context("lead"), owner = await context("owner");
  const scoped = students((await search(lead, { q: "ahmad raza" })).data);
  assert.deepEqual(scoped.rows.map(row => row.id), [pupils.ahmadA], "campus South is never counted for a campus North principal");
  assert.equal(scoped.total, 1);
  const all = students((await search(owner, { q: "Ahmad Raza", types: "student" })).data);
  assert.equal(all.total, 2);
  assert.notDeepEqual(all.rows[0].context, all.rows[1].context, "namesakes are told apart by class, campus and year");
  assert.equal(students((await search(owner, { q: "Ahmad Raza", campus: campusB })).data).rows[0].id, pupils.ahmadB);
  const exact = students((await search(lead, { q: "N-701" })).data);
  assert.equal(exact.rows[0].id, pupils.ahmadA); assert.equal(exact.rows[0].exact, true);
  await db.student.update({ where: { id: pupils.ahmadA }, data: { fullName: "Synthetic Ahmad Raza Qureshi" } });
  const renamed = students((await search(lead, { q: "ADM-2026-NORTH-0001" })).data);
  assert.equal(renamed.rows[0].title, "Synthetic Ahmad Raza Qureshi", "the stable identifier finds the renamed pupil at once");
});

test("Arabic spelling variants match; archived and merged records need an explicit filter or open the surviving record", async () => {
  const lead = await context("lead");
  assert.equal(students((await search(lead, { q: "احمد" })).data).rows[0]?.id, pupils.arabic, "hamza and diacritics are ignored");
  assert.equal(students((await search(lead, { q: "Former Pupil Zara" })).data).total, 0, "archived pupils are not shown by default");
  const archived = students((await search(lead, { q: "Former Pupil Zara", status: "archived" })).data);
  assert.equal(archived.rows[0].id, pupils.archived); assert.equal(archived.rows[0].archived, true);
  const merged = students((await search(lead, { q: "ADM-2025-OLD-0851", status: "all" })).data);
  assert.equal(merged.rows[0].id, pupils.survivor, "an old identifier opens the surviving record");
  assert.match(merged.rows[0].note ?? "", /merged into Synthetic Survivor Hina/);
  assert.equal(merged.rows[0].href, `/pupils/${pupils.survivor}`);
});

test("filters combine with AND, types with OR, and a single type pages through every result", async () => {
  const lead = await context("lead");
  const both = (await search(lead, { q: "Grade 7" })).data;
  assert.ok(both.groups.some(group => group.type === "class" && group.total >= 2));
  const year = (await search(lead, { q: "Grade 7", types: "class", year: "2025" })).data.groups[0];
  assert.equal(year.total, 1, "class AND year");
  const narrow = students((await search(lead, { q: "Synthetic", types: "student", class: class7, year: "2026" })).data);
  assert.deepEqual(narrow.rows.map(row => row.id), [pupils.ahmadA]);
  assert.equal(students((await search(lead, { q: "Synthetic", types: "student", class: class7, year: "2025" })).data).total, 0, "conflicting filters give nothing rather than ignoring one");
  const page1 = students((await search(lead, { q: "Bulk Pupil", types: "student" })).data), page2 = students((await search(lead, { q: "Bulk Pupil", types: "student", page: "2" })).data);
  assert.equal(page1.total, 30); assert.equal(page1.rows.length, 25); assert.equal(page2.rows.length, 5);
  assert.equal(new Set([...page1.rows, ...page2.rows].map(row => row.id)).size, 30, "stable ordering: no repeats across pages");
});

test("teachers see only the classes they teach; families, unrelated roles and revoked permissions see nothing", async () => {
  const teacher = await context("teacher"), parent = await context("parent"), desk = await context("desk"), lead = await context("lead");
  const taught = (await search(teacher, { q: "Synthetic" })).data;
  assert.deepEqual(students(taught).rows.map(row => row.id), [pupils.ahmadA], "only Grade 7 B pupils");
  assert.equal(students((await search(teacher, { q: "Bulk Pupil" })).data).total, 0, "pupils of another class are not counted");
  assert.ok(!taught.allowedTypes.includes("application") && !taught.allowedTypes.includes("staff"));
  assert.equal((await search(parent, { q: "Synthetic" })).status, 403);
  assert.ok(!(await search(desk, { q: "Synthetic" })).data.allowedTypes.includes("staff"), "reception has no staff directory");
  assert.equal(students((await search(lead, { q: "N-701" })).data).total, 1);
  const grant = await db.rolePermission.create({ data: { schoolId, role: "PRINCIPAL", module: "students", canView: false, canAdd: false, canEdit: false, canDelete: false } });
  const revoked = (await search(lead, { q: "N-701" })).data;
  assert.ok(!revoked.allowedTypes.includes("student"), "the revoked type disappears on the very next search");
  assert.equal(students(revoked).total, 0);
  await db.rolePermission.delete({ where: { id: grant.id } });
});

test("the search page restores from the URL, drops stale answers, and opens the authoritative record", async () => {
  const lead = await context("lead"), page = await lead.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  // Make the first answer slow; the newer query must win.
  let slowed = false;
  await page.route("**/api/search?*", async route => {
    if (!slowed && route.request().url().includes("q=Bulk")) { slowed = true; await new Promise(resolve => setTimeout(resolve, 1500)); }
    await route.continue();
  });
  await page.goto(`${base}/search?q=Bulk&types=student`);
  const input = page.getByLabel("Search by name, roll number, admission number or reference");
  await input.fill("N-701");
  await page.locator(`[data-search-result="${pupils.ahmadA}"]`).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1800);
  assert.equal(await page.locator("[data-search-result]").count(), 1, "the slow older answer did not overwrite the newer one");
  await page.goto(`${base}/search?q=Synthetic&types=student&class=${class7}&year=2026`);
  await page.locator("[data-search-chips]").waitFor({ timeout: 15_000 });
  assert.equal(await page.locator("[data-search-chips] button").count(), 4, "type, year and class chips plus Clear filters");
  await page.getByRole("button", { name: /Remove filter Year 2026/ }).click();
  await page.waitForURL(url => !url.searchParams.has("year"));
  await page.locator(`[data-search-result="${pupils.ahmadA}"]`).click();
  await page.waitForURL(`**/pupils/${pupils.ahmadA}`);
  await page.goBack();
  await page.waitForURL(url => url.pathname === "/search" && url.searchParams.get("class") === class7);
  assert.equal(await input.inputValue(), "Synthetic", "Back restores the query");
  await page.goto(`${base}/search?q=Nobody%20Here&types=student&class=${class7}`);
  await page.locator("[data-search-empty]").filter({ hasText: /Filters in use/ }).waitFor();
  await shot(page, "search-empty-filters-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Arabic staff search on a phone reads right-to-left with isolated identifiers", async () => {
  const ctx = await context("lead-ar", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/search?q=${encodeURIComponent("احمد")}`);
  await page.locator(`[data-search-result="${pupils.arabic}"]`).waitFor({ timeout: 30_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await shot(page, "search-ar-390");
  await page.close();
});

test("the student directory keeps its filters in the URL and both roll tiles change the list", async () => {
  const lead = await context("lead"), page = await lead.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/principal?view=students&sq=Bulk%20Pupil%2002`);
  await page.getByText("Synthetic Bulk Pupil 02").first().waitFor({ timeout: 30_000 });
  await page.reload();
  await page.getByText("Synthetic Bulk Pupil 02").first().waitFor({ timeout: 30_000 });
  assert.ok(page.url().includes("sq=Bulk"), "the search survives a refresh");
  await page.getByRole("button", { name: /Students on roll/ }).first().click();
  await page.waitForFunction(() => !location.search.includes("sq="));
  await shot(page, "students-directory-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});
