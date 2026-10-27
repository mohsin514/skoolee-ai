import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-401 on the isolated app with synthetic records: search covers only the reader's school and campus, before
// counting; exact identifiers rank first and survive a name change; Arabic spelling variants match; archived and
// merged records need an explicit filter or open the surviving record; a revoked permission removes a record type on
// the next search; the URL restores the search; an older response never overwrites a newer one.
// G47/C13 contract: record search belongs to campus operators, the principal and the front desk. The group admin,
// teachers, accountants and librarians get 403 "Record search is not part of your workspace." (and an AccessNotice
// on /search, never a Retry); families get 403; every result opens in the searcher's own console.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.SEARCH_TEST_APP || "http://localhost:3107";
const evidence = process.env.SEARCH_EVIDENCE_DIR || "/tmp/sko401-evidence";
const db = new PrismaClient(), password = "SyntheticSearch401!";
const schoolId = `search401-${randomUUID()}`, campusA = randomUUID(), campusB = randomUUID();
const otherSchool = `search306-${randomUUID()}`, otherCampus = randomUUID(), otherClass = randomUUID();
const class7 = randomUUID(), class8 = randomUUID(), class7old = randomUUID(), classB = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const pupils: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, campus: string | null = campusA, language = "en", tenant = schoolId) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId: tenant, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
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
  await db.school.create({ data: { id: otherSchool, name: "Synthetic Other Tenant", slug: otherSchool, regId: otherSchool, contactEmail: `${otherSchool}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: otherCampus, schoolId: otherSchool, name: "Other Tenant North", regId: otherCampus, city: "Lahore" } });
  await db.class.create({ data: { id: otherClass, schoolId: otherSchool, campusId: otherCampus, name: "Grade 7", section: "B", academicYear: 2026 } });
  await db.student.create({ data: { schoolId: otherSchool, campusId: otherCampus, classId: otherClass, fullName: "Synthetic Ahmad Raza", rollNo: "N-701", gender: "MALE", enrollmentDate: new Date("2025-04-01Z") } });
  await user("other-lead", "PRINCIPAL", otherCampus, "en", otherSchool);
  await user("lead-ur", "PRINCIPAL", campusA, "ur");
  await user("lead", "PRINCIPAL"); await user("leadB", "PRINCIPAL", campusB); await user("owner", "SUPER_ADMIN", null); const teacher = await user("teacher", "TEACHER");
  await user("desk", "RECEPTIONIST"); await user("parent", "PARENT"); await user("lead-ar", "PRINCIPAL", campusA, "ar");
  await user("ops", "CAMPUS_ADMIN"); await user("accountant", "ACCOUNTANT"); await user("librarian", "LIBRARIAN");
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
after(async () => { await browser?.close(); await db.student.updateMany({ where: { schoolId }, data: { consolidatedIntoId: null } }).catch(() => undefined); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.school.delete({ where: { id: otherSchool } }).catch(() => undefined); await db.$disconnect(); });

test("same-name pupils stay in their campus; an exact identifier ranks first and survives a name change", async () => {
  const lead = await context("lead"), leadB = await context("leadB");
  const scoped = students((await search(lead, { q: "ahmad raza" })).data);
  assert.deepEqual(scoped.rows.map(row => row.id), [pupils.ahmadA], "campus South is never counted for a campus North principal");
  assert.equal(scoped.total, 1);
  const south = students((await search(leadB, { q: "Ahmad Raza", types: "student" })).data);
  assert.deepEqual(south.rows.map(row => row.id), [pupils.ahmadB], "and campus North never for campus South");
  assert.notDeepEqual(scoped.rows[0].context, south.rows[0].context, "namesakes are told apart by class, campus and year");
  assert.equal(students((await search(leadB, { q: "Ahmad Raza", campus: campusA })).data).rows[0]?.id, pupils.ahmadB, "a campus filter never widens a campus-pinned reader");
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
  assert.equal(merged.rows[0].href, `/principal?view=students&student=${pupils.survivor}`, "the principal opens the academic console's read-only record");
  const ops = students((await search(await context("ops"), { q: "ADM-2025-OLD-0851", status: "all" })).data);
  assert.equal(ops.rows[0].href, `/pupils/${pupils.survivor}`, "a campus operator opens the pupil record page");
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

test("record search is refused outside its roles; reception sees applications only; revoked permissions see nothing", async () => {
  const parent = await context("parent"), desk = await context("desk"), lead = await context("lead");
  for (const key of ["owner", "teacher", "accountant", "librarian"]) {
    const response = await (await context(key)).request.get(`${base}/api/search?${new URLSearchParams({ q: "Synthetic" })}`);
    assert.equal(response.status(), 403, `${key} has no record search`);
    assert.equal((await response.json()).error, "Record search is not part of your workspace.", key);
  }
  assert.equal((await search(parent, { q: "Synthetic" })).status, 403);
  const reception = (await search(desk, { q: "Synthetic" })).data;
  assert.ok(reception.allowedTypes.every(type => type === "application"), `reception searches applications only (${reception.allowedTypes.join(",")})`);
  assert.equal(students(reception).total, 0, "no pupil records at the front desk");
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
  // The principal opens the pupil inside the academic console (G47), never another console's page.
  await page.waitForURL(url => url.pathname === "/principal" && url.searchParams.get("view") === "students" && url.searchParams.get("student") === pupils.ahmadA);
  await page.goBack();
  await page.waitForURL(url => url.pathname === "/search" && url.searchParams.get("class") === class7);
  assert.equal(await input.inputValue(), "Synthetic", "Back restores the query");
  await page.goto(`${base}/search?q=Nobody%20Here&types=student&class=${class7}`);
  await page.locator("[data-search-empty]").filter({ hasText: /Filters in use/ }).waitFor();
  await shot(page, "search-empty-filters-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});

test("campus operators open every result type in their own console", async () => {
  const ops = await context("ops");
  const found = (await search(ops, { q: "Synthetic" })).data;
  assert.ok(students(found).rows.length > 0);
  for (const row of students(found).rows) assert.equal(row.href, `/pupils/${row.id}`);
  const classes = (await search(ops, { q: "Grade 7", types: "class" })).data.groups[0];
  for (const row of classes.rows) assert.equal(row.href, `/admin?view=students&class=${row.id}`);
  const staff = (await search(ops, { q: "Synthetic", types: "staff" })).data.groups[0];
  assert.ok(staff.rows.length > 0);
  for (const row of staff.rows) assert.ok(["/admin?view=teachers", "/admin?view=staff-hierarchy"].includes(row.href), row.href);
  assert.ok(!staff.rows.some(row => row.context.includes("Group admin")), "the group admin is not campus staff");
});

test("the principal's staff search lists teachers only, since the academic console opens teachers only", async () => {
  const staff = (await search(await context("lead"), { q: "Synthetic", types: "staff" })).data.groups[0];
  assert.ok(staff.rows.length > 0);
  for (const row of staff.rows) assert.equal(row.href, "/principal?view=teachers");
  assert.ok(staff.rows.every(row => row.title === "Synthetic teacher"), staff.rows.map(row => row.title).join(","));
});

test("a role without record search sees an access notice on /search, never a Retry", async () => {
  const page = await (await context("teacher")).newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/search?q=Synthetic`);
  await page.waitForLoadState("networkidle");
  // P2 may send these roles home instead (§6.3); either way they never see a retry loop.
  if (new URL(page.url()).pathname === "/search") {
    await page.getByText("Record search is not part of your workspace.").first().waitFor({ timeout: 15_000 });
    assert.equal(await page.getByRole("button", { name: /^(Retry|Try again)$/ }).count(), 0);
  }
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

test("SCRUM-306: stable sorting, stale pages and denied options", async () => {
  const ctx = await context("lead");
  const first = students((await search(ctx, { q: "Bulk Pupil", types: "student", sort: "name-desc" })).data);
  const last = students((await search(ctx, { q: "Bulk Pupil", types: "student", sort: "name-desc", page: "2" })).data);
  assert.equal(first.rows[0].title, "Synthetic Bulk Pupil 29");
  assert.equal(new Set([...first.rows, ...last.rows].map(row => row.id)).size, 30);
  const stale = (await search(ctx, { q: "Bulk Pupil", types: "student", page: "400" })).data as Data & { page: number };
  assert.equal(stale.page, 2);
  assert.equal(students(stale).rows.length, 5);
  assert.equal((await (await context("teacher")).request.get(`${base}/api/search?options=1`)).status(), 403);
});

test("SCRUM-306: Back restores search input, sort and results without reverting the URL", async () => {
  const page = await (await context("lead")).newPage();
  await page.goto(`${base}/search?q=Bulk%20Pupil&types=student`);
  const input = page.getByLabel("Search by name, roll number, admission number or reference");
  await page.locator("[data-search-result]").first().waitFor();
  await page.getByLabel("Sort by", { exact: true }).selectOption("name-desc");
  await page.waitForURL(url => url.searchParams.get("sort") === "name-desc");
  await page.getByText("Synthetic Bulk Pupil 29", { exact: true }).waitFor();
  await shot(page, "scrum306-search-sorted-en-1440");
  await input.fill("N-701");
  await page.waitForURL(url => url.searchParams.get("q") === "N-701");
  await page.locator(`[data-search-result="${pupils.ahmadA}"]`).waitFor();
  await page.goBack();
  await page.waitForURL(url => url.searchParams.get("q") === "Bulk Pupil");
  await page.waitForFunction(() => (document.querySelector('input[type="search"]') as HTMLInputElement)?.value === "Bulk Pupil");
  await page.getByText("Synthetic Bulk Pupil 29", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("Synthetic Bulk Pupil 29", { exact: true }).waitFor();
  assert.equal(await input.inputValue(), "Bulk Pupil");
  await page.close();
});


test("SCRUM-306: tenant isolation applies to rows, counts, options and direct roster requests", async () => {
  const own = await context("lead"), other = await context("other-lead");
  const a = students((await search(own, { q: "N-701", types: "student" })).data);
  const b = students((await search(other, { q: "N-701", types: "student" })).data);
  assert.equal(a.total, 1); assert.equal(b.total, 1);
  assert.notEqual(a.rows[0].id, b.rows[0].id);
  assert.equal(students((await search(own, { q: "N-701", types: "student", class: otherClass })).data).total, 0);
  const options = await (await own.request.get(`${base}/api/search?options=1`)).json();
  assert.ok(!options.data.classes.some((cls: { id: string }) => cls.id === otherClass));
  const roster = await (await own.request.get(`${base}/api/students?classId=${otherClass}`)).json();
  assert.equal(roster.pagination.total, 0);
  const denied = await (await context("parent")).request.get(`${base}/api/students`);
  assert.equal(denied.status(), 403);
  const audit = await db.auditLog.findMany({ where: { schoolId, tableName: "record_search" } });
  assert.ok(audit.length > 0);
  assert.ok(audit.every(row => !JSON.stringify(row.newValue).includes("N-701")));
});

test("SCRUM-306: Urdu mobile sorting is labelled, RTL and has no horizontal overflow", async () => {
  const page = await (await context("lead-ur", { width: 390, height: 844 })).newPage();
  await page.goto(`${base}/search?q=Bulk%20Pupil&types=student&sort=name-desc`);
  await page.getByText("Synthetic Bulk Pupil 29", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dir), "rtl");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.getByLabel("ترتیب بلحاظ", { exact: true }).inputValue(), "name-desc");
  await shot(page, "scrum306-search-ur-390");
  await page.close();
});

test("SCRUM-306: invoice query and status survive refresh and Back without changing dashboard scope", async () => {
  const page = await (await context("accountant")).newPage();
  await page.goto(`${base}/accountant?view=invoices&inv.searchQuery=Synthetic&inv.statusFilter=PENDING&inv.page=99`);
  const input = page.getByPlaceholder("Search student or invoice #...");
  await input.waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => (document.querySelector('input[placeholder="Search student or invoice #..."]') as HTMLInputElement)?.value === "Synthetic");
  await page.getByRole("button", { name: "Paid", exact: true }).click();
  await page.waitForURL(url => url.searchParams.get("inv.statusFilter") === "PAID" && !url.searchParams.has("inv.page"));
  assert.equal(new URL(page.url()).searchParams.get("view"), "invoices");
  await page.reload();
  await input.waitFor();
  await page.waitForFunction(() => (document.querySelector('input[placeholder="Search student or invoice #..."]') as HTMLInputElement)?.value === "Synthetic");
  assert.equal(await page.getByRole("button", { name: "Paid", exact: true }).getAttribute("aria-pressed"), "true");
  await page.goBack();
  await page.waitForURL(url => url.searchParams.get("inv.statusFilter") === "PENDING");
  await shot(page, "scrum306-invoice-state-en-1440");
  await page.close();
});

test("SCRUM-306: transient and partial failures retry the same query and retain controls", async () => {
  const page = await (await context("lead")).newPage();
  let fail = true;
  await page.route("**/api/search?*", async route => {
    if (!route.request().url().includes("options=") && fail) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: "Search temporarily unavailable. Retry." }) });
    } else await route.continue();
  });
  await page.goto(`${base}/search?q=Bulk%20Pupil&types=student&sort=name-desc`);
  await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByText("Synthetic Bulk Pupil 29", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Sort by", { exact: true }).inputValue(), "name-desc");
  assert.equal(await page.getByLabel("Search by name, roll number, admission number or reference").inputValue(), "Bulk Pupil");
  let partial = true;
  await page.unroute("**/api/search?*");
  await page.route("**/api/search?*", async route => {
    if (!route.request().url().includes("options=") && partial) {
      const response = await route.fetch(); const json = await response.json();
      json.data.partial = true; json.data.sources.student = "failed";
      await route.fulfill({ response, json });
    } else await route.continue();
  });
  await page.reload();
  await page.locator("[data-search-partial]").waitFor();
  partial = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.locator("[data-search-partial]").waitFor({ state: "hidden" });
  await page.getByText("Synthetic Bulk Pupil 29", { exact: true }).waitFor();
  await page.close();
});

test("SCRUM-306: operations APIs bound reads, preserve complete selector/export traversal and scope counts", async () => {
  const ctx = await context("ops");
  await db.book.createMany({ data: Array.from({ length: 55 }, (_, index) => ({ schoolId, campusId: campusA, title: `Synthetic Book ${String(index).padStart(2, "0")}` })) });
  await db.book.create({ data: { schoolId: otherSchool, campusId: otherCampus, title: "Synthetic Book Other" } });
  const ids = new Set<string>();
  for (let page = 1; page <= 3; page++) {
    const response = await ctx.request.get(`${base}/api/library/books?search=Synthetic%20Book&page=${page}&limit=24&sort=name-desc`);
    assert.equal(response.status(), 200);
    const json = await response.json();
    assert.equal(json.pagination.total, 55);
    assert.equal(json.pagination.pages, 3);
    assert.ok(json.data.length <= 24);
    for (const row of json.data) { assert.ok(!ids.has(row.id)); ids.add(row.id); }
  }
  assert.equal(ids.size, 55);
  const clamped = await (await ctx.request.get(`${base}/api/library/books?page=999999999&limit=999999999`)).json();
  assert.equal(clamped.pagination.limit, 100); assert.equal(clamped.pagination.page, 1);
  assert.equal((await (await context("parent")).request.get(`${base}/api/library/books`)).status(), 403);
  const page = await (await context("librarian")).newPage();
  await page.goto(`${base}/librarian?view=catalogue&tab=books&library.search=Synthetic%20Book&library.sort=name-desc`);
  await page.getByText("Synthetic Book 54", { exact: true }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.waitForURL(url => url.searchParams.get("library.page") === "2");
  await page.getByText("Synthetic Book 30", { exact: true }).waitFor();
  await shot(page, "scrum306-library-page2-en-1440");
  await page.close();
});

test("SCRUM-306: offline recovery retains search and filters", async () => {
  const ctx = await context("lead"), page = await ctx.newPage();
  await page.goto(`${base}/search?q=Bulk%20Pupil&types=student&sort=name-desc`);
  await page.getByText("Synthetic Bulk Pupil 29", { exact: true }).waitFor();
  await ctx.setOffline(true);
  await page.getByLabel("Search by name, roll number, admission number or reference").fill("N-701");
  await page.getByRole("button", { name: "Try again", exact: true }).waitFor({ timeout: 20_000 });
  assert.equal(await page.getByLabel("Sort by", { exact: true }).inputValue(), "name-desc");
  await ctx.setOffline(false);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.locator(`[data-search-result="${pupils.ahmadA}"]`).waitFor();
  await page.close(); await ctx.close();
});

test("SCRUM-306: authenticated enumeration budget returns actionable 429", async () => {
  await user("budget", "PRINCIPAL");
  const ctx = await context("budget");
  let allowed = 0, denied = false;
  // Permit one minute boundary during the run; a complete bucket must still be bounded.
  for (let request = 0; request < 241; request++) {
    const response = await ctx.request.get(`${base}/api/search?options=1`);
    if (response.status() === 429) {
      assert.match((await response.json()).error, /Wait a minute and retry/);
      denied = true; break;
    }
    assert.equal(response.status(), 200); allowed++;
  }
  assert.ok(allowed >= 120); assert.equal(denied, true);
  await ctx.close();
});

test("SCRUM-306: stalled search times out and retries without losing the query", async () => {
  const page = await (await context("lead")).newPage();
  let stall = true;
  await page.route("**/api/search?*", async route => {
    if (!route.request().url().includes("options=") && stall) {
      await new Promise(resolve => setTimeout(resolve, 16000));
      await route.abort().catch(() => undefined);
    } else await route.continue();
  });
  await page.goto(`${base}/search?q=Bulk%20Pupil&types=student`);
  await page.getByRole("button", { name: "Try again", exact: true }).waitFor({ timeout: 25000 });
  stall = false;
  assert.equal(await page.getByLabel("Search by name, roll number, admission number or reference").inputValue(), "Bulk Pupil");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByText("Synthetic Bulk Pupil 00", { exact: true }).waitFor();
  await page.close();
});
