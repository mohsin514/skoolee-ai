import { evidence as commercialEvidence } from "./charter-fixture";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";

// SKO-430 on the isolated app: only the platform operator reaches pilot evidence; a pilot needs consent
// before it runs; synthetic demos never support a claim; claims need measured evidence and the school's
// permission, are frozen at approval, go stale when the source is corrected, and the external export
// carries no participant rows and names the school only with named permission.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || !((url.port === "55438" && url.pathname === "/postgres") || (url.port === "55483" && url.pathname === "/skai832"))) throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.PILOT_TEST_APP || "http://localhost:3108";
const evidence = process.env.PILOT_EVIDENCE_DIR || "/tmp/sko430-evidence";
const db = new PrismaClient(), password = "SyntheticPilot430!";
const schoolB = `QA-01-B-${randomUUID()}`, campusB = randomUUID();
const schoolId = `pi430-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await c.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await c.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await c.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await c.storageState());
  return c;
}
const post = async (key: string, path: string, data: object) => (await context(key)).request.post(`${base}/api/owner/pilots${path}`, { data });
const act = async (pilot: string, action: string, data: object) => post("owner", `/${pilot}`, { action, data: action === "charter" ? { ...data, version: (await detail(pilot)).pilot.charterHistory.length } : data });
const detail = async (pilot: string) => (await (await (await context("owner")).request.get(`${base}/api/owner/pilots/${pilot}`)).json()).data;
const exported = async () => (await (await (await context("owner")).request.get(`${base}/api/owner/pilots/export`)).json()).data;
const charter = (extra: object = {}) => ({ name: "QA-01 marks pilot", country: "AE", curriculum: "British", language: "en", useCase: "Paper marks entry", startsOn: "2026-09-01", endsOn: "2026-11-30",
  championName: "Synthetic Champion", measurementOwnerId: users.get("owner")!.id, targetSchoolId: schoolId,
  workflows: [{ key: "MARKS_ENTRY", definition: "Enter one class's term-test marks from paper.", successDefinition: "All marks entered and checked by the teacher." }], ...extra });
const observe = (pilot: string, participant: string, phase: string, active: number, correction: number, extra: object = {}) =>
  act(pilot, "observation", { workflow: "MARKS_ENTRY", phase, participant, task: "Term test, class of 30", difficulty: "Standard", activeSeconds: active, correctionSeconds: correction, elapsedSeconds: active * 2, completed: true, source: "OBSERVED", observedOn: phase === "BASELINE" ? "2026-09-05" : "2026-10-20", ...extra });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "QA-01 School A", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Dubai", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "QA-01 Campus A", regId: campusId, city: "Dubai" } });
  await db.school.create({ data: { id: schoolB, name: "QA-01 School B", slug: schoolB, regId: schoolB, contactEmail: "qa01b@example.invalid", city: "QA", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusB, schoolId: schoolB, name: "QA-01 Campus B", regId: campusB, city: "QA" } });
  await user("owner", "APP_OWNER"); await user("admin", "ADMIN"); await user("teacher", "TEACHER");
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.pilot.deleteMany({ where: { measurementOwnerId: users.get("owner")?.id } }).catch(() => undefined);
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.school.delete({ where: { id: schoolB } });
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("only the platform operator reaches pilot evidence; consent comes before a pilot runs", async () => {
  assert.equal((await (await context("admin")).request.get(`${base}/api/owner/pilots`)).status(), 403);
  assert.equal((await post("admin", "", charter())).status(), 403);
  assert.equal((await post("owner", "", charter({ measurementOwnerId: users.get("admin")!.id }))).status(), 400, "the measurement owner must be a platform operator");
  assert.equal((await post("teacher", "", charter())).status(), 403);
  const second = await post("owner", "", charter({ name: "QA-01 school B pilot", targetSchoolId: schoolB }));
  const secondId = (await second.json()).data.id;
  const secondBefore = await detail(secondId);
  const created = await post("owner", "", charter());
  assert.equal(created.status(), 201, await created.text());
  ids.pilot = (await created.json()).data.id;
  assert.equal((await post("admin", `/${ids.pilot}`, { action: "charter", data: { status: "ACTIVE" } })).status(), 403);
  const writes = await Promise.all([0, 1].map(() => post("owner", `/${ids.pilot}`, { action: "charter", data: { version: 0, caseStudyPermission: "NONE" } })));
  assert.deepEqual(writes.map(r => r.status()).sort(), [200, 409], "concurrent charter writes cannot overwrite each other");
  assert.equal((await act(ids.pilot, "charter", { status: "ACTIVE" })).status(), 409, "no consent recorded yet");
  assert.equal((await act(ids.pilot, "charter", { consentReference: "QA-01 signed consent", status: "ACTIVE", commercial: { ...commercialEvidence(), cycles: [1, 2].map(n => ({ id: `QA-01-cycle-${n}`, workflow: "MARKS_ENTRY", completed: true, reference: `QA-01-cycle-source-${n}`, date: `2026-10-0${n}` })) } })).status(), 200);
  assert.equal((await observe(ids.pilot, "teacher@example.invalid", "BASELINE", 600, 60)).status(), 400, "participants are pseudonyms, never emails");
  assert.deepEqual(await detail(secondId), secondBefore, "school B and campus B remain unchanged");
  const synth = await post("owner", "", charter({ name: "Synthetic demo walkthrough", synthetic: true }));
  ids.synthetic = (await synth.json()).data.id;
  assert.equal((await observe(ids.synthetic, "D-1", "BASELINE", 600, 60)).status(), 400, "a synthetic pilot only holds synthetic rows");
});

test("time findings pair comparable tasks, keep missing cases visible and withhold a percentage until enough pairs exist", async () => {
  for (const [i, p] of ["T-01", "T-02", "T-03", "T-04"].entries()) { await observe(ids.pilot, p, "BASELINE", 1200 + i * 60, 300); await observe(ids.pilot, p, "FOLLOW_UP", 700 + i * 60, 240); }
  await observe(ids.pilot, "T-06", "BASELINE", 1100, 200);
  await observe(ids.pilot, "T-07", "FOLLOW_UP", 600, 100, { difficulty: "Hard" });
  let time = (await detail(ids.pilot)).findings.time[0];
  assert.equal(time.counts.paired, 4);
  assert.equal(time.changePercent, null);
  const early = await act(ids.pilot, "claim", { statement: "Teachers spent less time entering paper marks during the pilot.", findingKey: "TIME:MARKS_ENTRY" });
  ids.earlyClaim = (await early.json()).data.id;
  const refused = await act(ids.pilot, "review", { claimId: ids.earlyClaim, version: 1, decision: "APPROVE", note: "Checking the evidence first." });
  assert.equal(refused.status(), 409);
  assert.match((await refused.json()).error, /Too few paired observations/);
  await observe(ids.pilot, "T-05", "BASELINE", 1500, 300); await observe(ids.pilot, "T-05", "FOLLOW_UP", 900, 300);
  time = (await detail(ids.pilot)).findings.time[0];
  assert.equal(time.counts.paired, 5);
  assert.equal(time.missing.baselineOnly, 1);
  assert.equal(time.missing.followUpOnly, 1, "a follow-up with changed difficulty is unpaired, not compared");
  assert.equal(time.changePercent, -34.6);
});

test("claims need measured evidence and permission, freeze at approval and go stale when the source is corrected", async () => {
  assert.equal((await act(ids.pilot, "measure", { kind: "SERVING_COST", periodStart: "2026-10-01", periodEnd: "2026-10-31", value: 12.5, unit: "USD", state: "MEASURED", method: "Provider invoices" })).status(), 400, "serving cost must include failed calls");
  assert.equal((await act(ids.pilot, "measure", { kind: "SERVING_COST", periodStart: "2026-10-01", periodEnd: "2026-10-31", value: 0, unit: "USD", state: "UNKNOWN", method: "Metering failed" })).status(), 400, "unknown is never zero");
  assert.equal((await act(ids.pilot, "measure", { kind: "SERVING_COST", periodStart: "2026-10-01", periodEnd: "2026-10-31", value: null, unit: "USD", state: "UNKNOWN", method: "Metering failed for this month" })).status(), 201);
  const extraction = await act(ids.pilot, "measure", { kind: "CORRECTNESS_EXTRACTION", workflow: "MARKS_ENTRY", periodStart: "2026-10-01", periodEnd: "2026-10-31", value: 41, denominator: 50, unit: "marks", state: "MEASURED", method: "Every 6th scanned page", reference: "Teacher-approved mark sheets" });
  assert.equal(extraction.status(), 201);
  const final = await act(ids.pilot, "measure", { kind: "CORRECTNESS_FINAL", workflow: "MARKS_ENTRY", periodStart: "2026-10-01", periodEnd: "2026-10-31", value: 50, denominator: 50, unit: "marks", state: "MEASURED", method: "Every 6th scanned page", reference: "Teacher-approved mark sheets" });
  ids.final = (await final.json()).data.id;
  const correctness = (await detail(ids.pilot)).findings.correctness[0];
  assert.equal(correctness.extraction.rate, 82);
  assert.equal(correctness.final.rate, 100, "final approved accuracy is never blended with extraction accuracy");
  await act(ids.pilot, "measure", { kind: "PAID_CONVERSION", periodStart: "2026-11-01", periodEnd: "2026-11-30", value: 1, denominator: 1, unit: "school", state: "VERBAL_INTENT", method: "Principal said they would subscribe" });

  const claim = async (statement: string, findingKey: string, identifiable = false) => (await (await act(ids.pilot, "claim", { statement, findingKey, identifiable })).json()).data.id as string;
  ids.conversion = await claim("The pilot school converted to a paid plan after the pilot.", "PAID_CONVERSION");
  const intent = await act(ids.pilot, "review", { claimId: ids.conversion, version: 1, decision: "APPROVE", note: "Checking conversion evidence." });
  assert.match((await intent.json()).error, /none is a measured result/, "verbal intent is not conversion");

  ids.accuracy = await claim("After teacher review, every sampled mark matched the approved sheet.", "CORRECTNESS_FINAL:MARKS_ENTRY");
  const noPermission = await act(ids.pilot, "review", { claimId: ids.accuracy, version: 1, decision: "APPROVE", note: "Evidence checked against sheets." });
  assert.match((await noPermission.json()).error, /case-study permission/);
  assert.equal((await act(ids.pilot, "charter", { caseStudyPermission: "AGGREGATE" })).status(), 409, "permission needs a reference");
  assert.equal((await act(ids.pilot, "charter", { caseStudyPermission: "AGGREGATE", permissionReference: "Email from principal, 2026-11-02 (synthetic)" })).status(), 200);
  ids.named = await claim("QA-01 School A cut marks entry time in its pilot.", "TIME:MARKS_ENTRY", true);
  assert.match((await (await act(ids.pilot, "review", { claimId: ids.named, version: 1, decision: "APPROVE", note: "Checking named permission." })).json()).error, /anonymised figures only/);
  assert.equal((await act(ids.pilot, "review", { claimId: ids.accuracy, version: 1, decision: "APPROVE", note: "Evidence checked against sheets." })).status(), 200);
  assert.equal((await act(ids.pilot, "review", { claimId: ids.earlyClaim, version: 1, decision: "APPROVE", note: "Five pairs now recorded." })).status(), 200);
  assert.equal((await act(ids.pilot, "review", { claimId: ids.accuracy, version: 1, decision: "RETURN", note: "Stale version check." })).status(), 409, "a stale review version is refused");

  const synthClaim = (await (await act(ids.synthetic, "claim", { statement: "The demo shows how marks entry is measured.", findingKey: "TIME:MARKS_ENTRY" })).json()).data.id;
  await act(ids.synthetic, "charter", { caseStudyPermission: "AGGREGATE", permissionReference: "Not applicable (synthetic)" });
  assert.match((await (await act(ids.synthetic, "review", { claimId: synthClaim, version: 1, decision: "APPROVE", note: "Trying a synthetic approval." })).json()).error, /synthetic pilot/);

  let out = await exported();
  const mine = out.statements.filter((s: { claimId: string }) => [ids.accuracy, ids.earlyClaim].includes(s.claimId));
  assert.equal(mine.length, 2);
  for (const s of mine) {
    assert.equal(s.school, null, "aggregate permission never names the school");
    assert.equal(s.cohort.country, "AE");
    assert.ok(!JSON.stringify(s).includes("T-0"), "no participant pseudonyms leave the console");
  }
  assert.ok(mine.find((s: { claimId: string }) => s.claimId === ids.earlyClaim).limitations.some((l: string) => /does not show that the product caused/.test(l)));

  // The source is corrected after approval: the claim goes stale, is blocked, and keeps its history.
  assert.equal((await act(ids.pilot, "measure", { kind: "CORRECTNESS_FINAL", workflow: "MARKS_ENTRY", periodStart: "2026-10-01", periodEnd: "2026-10-31", value: 48, denominator: 50, unit: "marks", state: "MEASURED", method: "Every 6th scanned page", reference: "Re-checked mark sheets", supersedesId: ids.final })).status(), 201);
  out = await exported();
  assert.ok(!out.statements.some((s: { claimId: string }) => s.claimId === ids.accuracy));
  assert.ok(out.excluded.some((x: { claimId: string; reason: string }) => x.claimId === ids.accuracy && /evidence changed/.test(x.reason)));
  const stale = await db.pilotClaim.findUnique({ where: { id: ids.accuracy } });
  assert.equal(stale!.status, "STALE");
  assert.ok((stale!.history as { action: string }[]).some((h) => h.action === "APPROVE"), "the approved version stays in history");

  // Permission withdrawn: nothing from this pilot leaves.
  await act(ids.pilot, "charter", { caseStudyPermission: "NONE" });
  out = await exported();
  assert.ok(!out.statements.some((s: { claimId: string }) => s.claimId === ids.earlyClaim));
  assert.ok(out.excluded.some((x: { claimId: string; reason: string }) => x.claimId === ids.earlyClaim && /not given case-study permission/.test(x.reason)));
  await act(ids.pilot, "charter", { caseStudyPermission: "AGGREGATE", permissionReference: "Email from principal, 2026-11-02 (synthetic)" });
});

test("the owner console shows denominators, withheld figures and claim states (EN/UR desktop, AR phone; recovery and accessibility)", async () => {
  const c = await context("owner");
  const page = await c.newPage();
  await page.goto(`${base}/owner?view=pilots`);
  await page.getByRole("button", { name: "Pilot evidence" }).first().click().catch(() => undefined);
  await page.getByRole("heading", { name: "Pilot evidence" }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /QA-01 marks pilot/ }).click();
  await page.getByRole("heading", { name: "Task time: baseline vs follow-up" }).waitFor();
  assert.ok(await page.getByText("5 of 6 baseline / 6 follow-up").isVisible());
  assert.ok(await page.getByText("Stale").first().isVisible(), "the corrected claim is shown as stale");
  await page.getByRole("heading", { name: "Commercial charter evidence" }).scrollIntoViewIfNeeded();
  await page.locator("[data-boot-splash]").waitFor({ state: "hidden" });
  await page.screenshot({ path: `${evidence}/en-1440-pilot.png`, fullPage: false });
  const price = page.getByLabel("Pilot price", { exact: false });
  await price.fill("125");
  await page.route("**/api/owner/pilots/*", route => route.request().method() === "POST" ? route.abort() : route.continue());
  await page.getByRole("button", { name: "Save charter", exact: true }).click();
  await page.getByText("Request failed", { exact: true }).waitFor();
  assert.equal(await price.inputValue(), "125", "network failure preserves edits");
  await page.unroute("**/api/owner/pilots/*");
  await page.getByRole("button", { name: "Save charter", exact: true }).click();
  await page.getByText("Charter updated.", { exact: true }).waitFor();
  assert.equal((await detail(ids.pilot)).pilot.charterHistory.at(-1).commercial.price, 125);
  await price.focus(); await page.keyboard.press("Tab");
  assert.equal(await page.getByLabel("Currency", { exact: false }).evaluate(el => el === document.activeElement), true);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole("heading", { name: "Commercial charter evidence" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidence}/en-200-percent.png` });
  await page.close();

  await db.user.update({ where: { id: users.get("owner")!.id }, data: { preferredLanguage: "ar" } });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: sessions.get("owner"), reducedMotion: "reduce" });
  const ar = await phone.newPage();
  await ar.goto(`${base}/owner?view=pilots`);
  await ar.getByRole("heading", { name: "أدلة التجربة الميدانية" }).waitFor({ timeout: 60_000 });
  await ar.getByRole("button", { name: /QA-01 marks pilot/ }).click();
  await ar.getByRole("heading", { name: "عينات الدقة" }).waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await ar.getByRole("heading", { name: "أدلة الميثاق التجاري" }).scrollIntoViewIfNeeded();
  await ar.locator("[data-boot-splash]").waitFor({ state: "hidden" });
  await ar.screenshot({ path: `${evidence}/ar-390-pilot.png` });
  await phone.close();
  await db.user.update({ where: { id: users.get("owner")!.id }, data: { preferredLanguage: "ur" } });
  const ur = await c.newPage(); await ur.goto(`${base}/owner?view=pilots`);
  await ur.getByRole("button", { name: /QA-01 marks pilot/ }).click();
  await ur.getByRole("heading", { name: "تجارتی چارٹر کے شواہد" }).scrollIntoViewIfNeeded();
  await ur.locator("[data-boot-splash]").waitFor({ state: "hidden" });
  assert.equal(await ur.evaluate(() => document.documentElement.dir), "rtl");
  await ur.screenshot({ path: `${evidence}/ur-1440-pilot.png` }); await ur.close();
  await db.user.update({ where: { id: users.get("owner")!.id }, data: { preferredLanguage: "en" } });
});
