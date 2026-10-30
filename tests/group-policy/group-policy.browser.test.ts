import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-443 on the isolated app with synthetic data: a PK board, a Saudi and a UAE IB campus. Templates that do not fit
// a campus block rather than coerce; publishing is preview → submit (hash-bound) → second-owner review, and a campus
// change in between makes the approval stale; locked keys refuse changes through the grading API and the override
// path; overrides record reason, approver, validity and the version they modify, and expire back to the inherited
// value; scheduled versions activate once at their date; earlier records keep the version that governed them.
// role-ux §7.3 G16 (GROUP school): the library, templates and reviews belong to the group admin; override requests to the
// campus admin of a group campus (the principal reads the campus policy and sets grading, but no longer requests
// overrides); `/group-policy` redirects the group admin to Standards › Policies and a group campus admin to Campus setup ›
// Group standards (§6.3), and sends everyone else home.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.POLICY_TEST_APP || "http://localhost:3107";
const evidence = process.env.POLICY_EVIDENCE_DIR || "/tmp/sko443-evidence";
const db = new PrismaClient(), password = "SyntheticPolicy443!";
const schoolId = `pol443-${randomUUID()}`, north = randomUUID(), riyadh = randomUUID(), dubai = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, campus = north, language = "en") {
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
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const body = await r.text(); await ctx.close(); let json: { data?: any; error?: string; code?: string } = {}; try { json = JSON.parse(body); } catch { /* */ } return { status: r.status(), json, body }; };
const gp = (key: string, data: Record<string, unknown>) => call(key, "post", "/api/group-policy", data);
const campusView = (key: string, campusId: string, extra = "") => call(key, "get", `/api/group-policy?view=campus&domain=GRADING&campusId=${campusId}${extra}`);
const row = (view: { json: { data?: any } }, key: string) => view.json.data.rows.find((r: { key: string }) => r.key === key);
const id = (key: string) => users.get(key)!.id;
const grading = (key: string, extra: Record<string, unknown> = {}) => call(key, "post", "/api/grade-config", { className: "Grade 7", academicYear: 2026, quizWeight: 10, classTestWeight: 20, midTermWeight: 30, finalWeight: 40, passingPercentage: 50, gradeAplus: 90, gradeA: 80, gradeB: 70, gradeC: 60, gradeD: 50, roundingRule: "WHOLE", missingMarkPolicy: "COUNT_AS_ZERO", absentMarkPolicy: "COUNT_AS_ZERO", exemptMarkPolicy: "EXCLUDE", weightMode: "NORMALIZED", ...extra });
const previewOf = (key: string, versionId: string, effectiveFrom?: string) => call(key, "get", `/api/group-policy?view=preview&versionId=${versionId}${effectiveFrom ? `&effectiveFrom=${encodeURIComponent(effectiveFrom)}` : ""}`);

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Crescent Group", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", timezone: "Asia/Karachi", registrationKind: "GROUP" } as never });
  for (const [cid, name, board, country] of [[north, "Crescent Lahore", "FBISE", "PK"], [riyadh, "Crescent Riyadh", "MOE", "SA"], [dubai, "Crescent Dubai", "IB", "AE"]]) {
    await db.campus.create({ data: { id: cid, schoolId, name, regId: cid, city: name.split(" ")[1], board } });
    await db.academicCycle.create({ data: { schoolId, campusId: cid, label: "2026", academicYear: 2026, status: "ACTIVE" } });
    await db.localePolicy.create({ data: { schoolId, campusId: cid, scopeKey: cid, settings: { country }, effectiveAt: new Date("2026-01-01Z"), createdBy: "synthetic" } });
  }
  await user("owner1", "SUPER_ADMIN"); await user("owner2", "SUPER_ADMIN"); await user("principal", "PRINCIPAL"); await user("dubaiPrincipal", "PRINCIPAL", dubai); await user("teacher", "TEACHER");
  await user("campus", "CAMPUS_ADMIN"); await user("dubaiCampus", "CAMPUS_ADMIN", dubai); await user("campus-ar", "CAMPUS_ADMIN", north, "ar");
  for (const [cid, sec] of [[north, "A"], [north, "B"], [dubai, "A"]]) await db.class.create({ data: { id: randomUUID(), schoolId, campusId: cid, name: "Grade 7", section: sec, academicYear: 2026 } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("no template: campus settings stand, staff can read them, only the group admin publishes and only campus admins request", async () => {
  assert.equal((await grading("principal")).status, 200, "the campus sets its own grading while no template governs it");
  const view = await campusView("teacher", north);
  assert.equal(view.status, 200);
  assert.equal(view.json.data.template, null);
  assert.deepEqual([row(view, "passingPercentage").source, row(view, "passingPercentage").value], ["CAMPUS", 50]);
  assert.equal(view.json.data.canRequest, false);
  assert.equal((await campusView("principal", north)).json.data.canRequest, false, "G16: the principal no longer requests overrides");
  assert.equal((await campusView("campus", north)).json.data.canRequest, true, "the group campus admin requests overrides for its campus");
  assert.equal((await call("teacher", "get", "/api/group-policy?view=library")).status, 403);
  assert.equal((await call("campus", "get", "/api/group-policy?view=library")).status, 403, "campus admins are not the group admin");
  assert.equal((await call("principal", "get", "/api/group-policy?view=library")).status, 403, "campus leaders are not group owners");
  assert.equal((await gp("principal", { action: "template", domain: "GRADING", title: "X", campusIds: [north] })).status, 403);
  assert.equal((await call("teacher", "get", `/api/group-policy?view=campus&domain=GRADING&campusId=${dubai}`)).json.data.campus.id, north, "campus staff see their own campus only");
});

test("a template that does not fit a campus blocks; incompatible campuses need their own template", async () => {
  const t = await gp("owner1", { action: "template", domain: "GRADING", title: "Crescent PK board grading", countries: ["PK"], boards: ["FBISE"], campusIds: [north, dubai] });
  assert.equal(t.status, 201); ids.t = t.json.data.id;
  assert.equal((await gp("owner1", { action: "draft", templateId: ids.t, values: { passingPercentage: 40, gradeA: 80, roundingRule: "HALF" } })).status, 400, "values are validated");
  assert.equal((await gp("owner1", { action: "draft", templateId: ids.t, values: { passingPercentage: 40, gradeA: 80, gradeB: 85 } })).status, 400, "grade ladder must descend");
  const d = await gp("owner1", { action: "draft", templateId: ids.t, values: { passingPercentage: 40, gradeA: 80, roundingRule: "WHOLE" }, overridableKeys: ["gradeA"] });
  assert.equal(d.status, 200); ids.v1 = d.json.data.id;
  const v = await db.policyTemplateVersion.findUniqueOrThrow({ where: { id: ids.v1 } });
  assert.deepEqual([v.lockedKeys.sort(), v.overridableKeys], [["passingPercentage", "roundingRule"], ["gradeA"]], "every key set is locked unless made overridable");
  const p = await previewOf("owner1", ids.v1);
  assert.deepEqual([p.json.data.affected, p.json.data.blocking], [2, 1]);
  const dub = p.json.data.campuses.find((c: { name: string }) => c.name === "Crescent Dubai");
  assert.equal(dub.compatible, false);
  assert.ok(dub.problems.some((x: string) => x.includes("AE")) && dub.problems.some((x: string) => x.includes("IB")), JSON.stringify(dub.problems));
  const lah = p.json.data.campuses.find((c: { name: string }) => c.name === "Crescent Lahore");
  assert.deepEqual(lah.changes.map((c: { key: string; from: unknown; to: unknown }) => [c.key, c.from, c.to]), [["passingPercentage", 50, 40]]);
  const blocked = await gp("owner1", { action: "submit", versionId: ids.v1, effectiveFrom: new Date().toISOString(), reviewerId: id("owner2"), previewHash: p.json.data.previewHash });
  assert.equal(blocked.status, 409); assert.match(blocked.json.error ?? "", /incompatible/);
  // Separate templates: Dubai leaves this one and gets its own IB template.
  assert.equal((await gp("owner1", { action: "template-update", id: ids.t, campusIds: [north] })).status, 200);
  ids.tIb = (await gp("owner1", { action: "template", domain: "GRADING", title: "Crescent IB grading", countries: ["AE"], boards: ["IB"], campusIds: [dubai] })).json.data.id;
  const ib = await gp("owner1", { action: "draft", templateId: ids.tIb, values: { passingPercentage: 60 } });
  const pib = await previewOf("owner1", ib.json.data.id);
  assert.deepEqual([pib.json.data.affected, pib.json.data.blocking], [1, 0]);
});

test("publishing: hash-bound submit, a second owner reviews, a campus change in between makes approval stale", async () => {
  const now = new Date(Date.now() - 60_000).toISOString();
  const p = await previewOf("owner1", ids.v1, now);
  assert.equal(p.json.data.blocking, 0);
  assert.equal((await gp("owner1", { action: "submit", versionId: ids.v1, effectiveFrom: now, reviewerId: id("owner1"), previewHash: p.json.data.previewHash })).status, 400, "not your own reviewer");
  assert.equal((await gp("owner1", { action: "submit", versionId: ids.v1, effectiveFrom: now, reviewerId: id("owner2"), previewHash: "0".repeat(64) })).status, 409, "the preview must be current");
  assert.equal((await gp("owner1", { action: "submit", versionId: ids.v1, effectiveFrom: now, reviewerId: id("owner2"), previewHash: p.json.data.previewHash })).status, 200);
  assert.equal((await gp("owner1", { action: "review", versionId: ids.v1, decision: "APPROVE" })).status, 403, "only the named reviewer");
  // The campus changes a setting the release will replace, after the preview.
  assert.equal((await grading("principal", { passingPercentage: 45 })).status, 200);
  const stale = await gp("owner2", { action: "review", versionId: ids.v1, decision: "APPROVE" });
  assert.equal(stale.status, 409); assert.match(stale.json.error ?? "", /changed since/);
  assert.equal((await gp("owner2", { action: "review", versionId: ids.v1, decision: "RETURN" })).status, 200);
  const p2 = await previewOf("owner1", ids.v1, now);
  assert.deepEqual(p2.json.data.campuses[0].changes.map((c: { from: unknown }) => c.from), [45], "the new preview shows the intervening change");
  assert.equal((await gp("owner1", { action: "submit", versionId: ids.v1, effectiveFrom: now, reviewerId: id("owner2"), previewHash: p2.json.data.previewHash })).status, 200);
  const ok = await gp("owner2", { action: "review", versionId: ids.v1, decision: "APPROVE" });
  assert.deepEqual([ok.status, ok.json.data.status], [200, "ACTIVE"]);
  assert.equal(await db.policyEvent.count({ where: { versionId: ids.v1, kind: "ACTIVATED" } }), 1, "activation is recorded once");
  assert.deepEqual((await db.policyEvent.findMany({ where: { versionId: ids.v1 }, orderBy: { createdAt: "asc" } })).map(e => e.kind), ["SUBMITTED", "STALE_APPROVAL", "RETURNED", "SUBMITTED", "SCHEDULED", "ACTIVATED"]);
});

test("locked values refuse changes through the grading API and the override path; inherited values say where they come from", async () => {
  const view = await campusView("principal", north);
  assert.deepEqual([row(view, "passingPercentage").source, row(view, "passingPercentage").value, row(view, "passingPercentage").version], ["GROUP_LOCKED", 40, 1]);
  assert.deepEqual([row(view, "gradeA").source, row(view, "gradeA").value], ["GROUP_DEFAULT", 80]);
  assert.equal(row(view, "gradeB").source, "CAMPUS");
  const denied = await grading("principal", { passingPercentage: 45 });
  assert.deepEqual([denied.status, denied.json.code], [403, "POLICY_LOCKED"]);
  assert.match(denied.json.error ?? "", /locked by Group Policy v1/);
  assert.equal((await db.gradeWeightConfig.findFirstOrThrow({ where: { schoolId, campusId: north } })).passingPercentage, 45, "nothing was written");
  assert.equal(await db.policyEvent.count({ where: { schoolId, kind: "LOCK_DENIED" } }), 1);
  const saved = await grading("principal", { passingPercentage: 40 });
  assert.equal(saved.status, 200, saved.body);
  const rows = await db.gradeWeightConfig.findMany({ where: { schoolId, campusId: north } });
  const prov = await db.policyProvenance.findMany({ where: { schoolId, recordType: "GRADE_WEIGHT_CONFIG", recordId: { in: rows.map(r => r.id) } } });
  assert.equal(prov.length, 2, "both sections record the version that governed them");
  assert.ok(prov.every(x => x.versionId === ids.v1));
  ids.provRecord = rows[0].id;
  const viaOverride = await gp("campus", { action: "request-override", campusId: north, domain: "GRADING", key: "passingPercentage", value: 35, reason: "Board allows 33", validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  assert.equal(viaOverride.status, 403); assert.match(viaOverride.json.error ?? "", /locked/);
  assert.equal((await gp("teacher", { action: "request-override", campusId: north, domain: "GRADING", key: "gradeA", value: 85, reason: "x x x x x", validUntil: new Date(Date.now() + 86_400_000).toISOString() })).status, 403);
});

test("an override records reason, approver, validity and the version it modifies, then expires back to the inherited value", async () => {
  const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
  assert.equal((await gp("campus", { action: "request-override", campusId: north, domain: "GRADING", key: "gradeA", value: 85, reason: "", validUntil: until })).status, 400, "a reason is required");
  const r = await gp("campus", { action: "request-override", campusId: north, domain: "GRADING", key: "gradeA", value: 85, reason: "FBISE scholarship bands start A at 85 this year", validUntil: until });
  assert.equal(r.status, 201); ids.o1 = r.json.data.id;
  assert.equal(row(await campusView("principal", north), "gradeA").value, 80, "pending changes nothing");
  assert.equal((await gp("campus", { action: "decide-override", id: ids.o1, decision: "APPROVE" })).status, 403, "campus admins do not approve");
  assert.equal((await gp("principal", { action: "request-override", campusId: north, domain: "GRADING", key: "gradeB", value: 72, reason: "The principal asks for a different band", validUntil: until })).status, 403, "G16: override requests are the campus admin's");
  assert.equal((await gp("owner1", { action: "decide-override", id: ids.o1, decision: "APPROVE" })).status, 200);
  const o = await db.policyOverride.findUniqueOrThrow({ where: { id: ids.o1 } });
  assert.deepEqual([o.reason, o.approverId, o.versionId, o.status], ["FBISE scholarship bands start A at 85 this year", id("owner1"), ids.v1, "APPROVED"]);
  const view = await campusView("principal", north);
  const ga = row(view, "gradeA");
  assert.deepEqual([ga.source, ga.value, ga.override.approver, ga.override.modifiesVersion], ["OVERRIDE", 85, "Synthetic owner1", 1]);
  assert.equal((await grading("principal", { passingPercentage: 40, gradeA: 80 })).status, 403, "the campus now uses its override value");
  assert.equal((await grading("principal", { passingPercentage: 40, gradeA: 85 })).status, 200);
  ids.duringOverride = new Date().toISOString();
  // Expire it: the inherited value resumes; the past still shows the override.
  await new Promise(r => setTimeout(r, 1500));
  await db.policyOverride.update({ where: { id: ids.o1 }, data: { validUntil: new Date(Date.now() - 500) } });
  const back = await campusView("principal", north);
  assert.deepEqual([row(back, "gradeA").source, row(back, "gradeA").value], ["GROUP_DEFAULT", 80]);
  const cron = await fetch(`${base}/api/cron/group-policy`, { method: "POST" }).then(x => x.json());
  assert.ok(cron.expired >= 1);
  assert.equal((await db.policyOverride.findUniqueOrThrow({ where: { id: ids.o1 } })).status, "EXPIRED");
  const past = await campusView("principal", north, `&at=${encodeURIComponent(ids.duringOverride)}`);
  assert.deepEqual([row(past, "gradeA").source, row(past, "gradeA").value], ["OVERRIDE", 85], "history keeps the rule that applied");
});

test("a future version is staged, shows kept and ended overrides, activates once at its date, and history keeps v1", async () => {
  const pending = await gp("campus", { action: "request-override", campusId: north, domain: "GRADING", key: "gradeA", value: 82, reason: "Second request for the spring term", validUntil: new Date(Date.now() + 60 * 86_400_000).toISOString() });
  assert.equal(pending.status, 201);
  const d2 = await gp("owner1", { action: "draft", templateId: ids.t, values: { passingPercentage: 45, gradeA: 80, roundingRule: "WHOLE" }, overridableKeys: [] });
  ids.v2 = d2.json.data.id;
  assert.equal(d2.json.data.version, 2);
  const future = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const p = await previewOf("owner1", ids.v2, future);
  assert.deepEqual(p.json.data.campuses[0].endedOverrides.map((o: { key: string; status: string }) => [o.key, o.status]), [["gradeA", "PENDING"]], "an override that v2 locks is shown as ending");
  assert.equal((await gp("owner1", { action: "submit", versionId: ids.v2, effectiveFrom: future, reviewerId: id("owner2"), previewHash: p.json.data.previewHash })).status, 200);
  const sched = await gp("owner2", { action: "review", versionId: ids.v2, decision: "APPROVE" });
  assert.deepEqual([sched.status, sched.json.data.status], [200, "SCHEDULED"]);
  const view = await campusView("principal", north);
  assert.equal(view.json.data.scheduled.version, 2);
  assert.deepEqual([row(view, "passingPercentage").value, row(view, "passingPercentage").version], [40, 1], "v1 still applies today");
  assert.equal(row(await campusView("principal", north, `&at=${encodeURIComponent(new Date(Date.now() + 3 * 86_400_000).toISOString())}`), "passingPercentage").value, 45, "the future date resolves to v2");
  // The date arrives.
  await new Promise(r => setTimeout(r, 2000));
  await db.policyTemplateVersion.update({ where: { id: ids.v2 }, data: { effectiveFrom: new Date(Date.now() - 500) } });
  const [c1, c2] = [await fetch(`${base}/api/cron/group-policy`, { method: "POST" }).then(x => x.json()), await fetch(`${base}/api/cron/group-policy`, { method: "POST" }).then(x => x.json())];
  assert.ok(c1.activated + c2.activated <= 1);
  assert.equal(await db.policyEvent.count({ where: { versionId: ids.v2, kind: "ACTIVATED" } }), 1, "one auditable activation");
  assert.deepEqual((await db.policyTemplateVersion.findMany({ where: { templateId: ids.t }, orderBy: { version: "asc" } })).map(v => v.status), ["SUPERSEDED", "ACTIVE"]);
  assert.equal(row(await campusView("principal", north), "passingPercentage").value, 45);
  assert.equal((await db.policyOverride.findFirstOrThrow({ where: { schoolId, key: "gradeA", value: { equals: 82 } } })).status, "REVOKED", "the pending override v2 locks out ended at activation");
  assert.equal((await gp("campus", { action: "request-override", campusId: north, domain: "GRADING", key: "gradeA", value: 84, reason: "Third request after v2", validUntil: new Date(Date.now() + 86_400_000).toISOString() })).status, 403, "v2 locks gradeA");
  const prov = await call("principal", "get", `/api/group-policy?view=provenance&recordType=GRADE_WEIGHT_CONFIG&recordId=${ids.provRecord}`);
  assert.ok(prov.json.data.length >= 1 && prov.json.data.every((x: { versionId: string }) => x.versionId === ids.v1), "earlier rows keep v1 as their provenance");
  assert.equal((await db.gradeWeightConfig.findUniqueOrThrow({ where: { id: ids.provRecord } })).passingPercentage, 40, "activation does not rewrite existing records");
  assert.equal(row(await campusView("principal", north, `&at=${encodeURIComponent(ids.duringOverride)}`), "passingPercentage").value, 40, "the past resolves to v1");
});

test("screens: campus policy cards, override request, group impact preview, phone, Arabic", async () => {
  const campusSetup = /\/admin\?view=settings&tab=group-standards/;
  const p = await (await context("campus")).newPage();
  await p.goto(`${base}/group-policy`);
  await p.waitForURL(campusSetup);
  await p.locator('[data-policy-row="passingPercentage"][data-policy-source="GROUP_LOCKED"]').waitFor();
  assert.match(await p.locator('[data-policy-row="passingPercentage"]').innerText(), /Locked by Group Policy v2/);
  assert.equal(await p.locator("[data-group-library]").count(), 0, "campus admins do not see the group library");
  await shot(p, "01-campus-policy");
  await p.close();
  // A draft v3 to preview on screen (Dubai is not on this template; the IB one is separate).
  await gp("owner1", { action: "draft", templateId: ids.t, values: { passingPercentage: 45, gradeA: 80, roundingRule: "WHOLE", gradeB: 70 }, overridableKeys: ["gradeB"] });
  const o = await (await context("owner1")).newPage();
  await o.goto(`${base}/group-policy`);
  await o.waitForURL(/\/super\?view=standards&tab=policies/);
  await o.locator('[data-template="Crescent PK board grading"] [data-template-open]').click();
  await o.locator("[data-draft-preview]").click();
  await o.locator("[data-impact]").waitFor();
  await shot(o, "02-group-impact-preview");
  await o.locator('[data-template="Crescent IB grading"] [data-template-open]').click();
  await o.close();
  // A scheduled future version and an override request on a phone.
  const phone = await (await context("campus", { width: 390, height: 844 })).newPage();
  await phone.goto(`${base}/group-policy`);
  await phone.waitForURL(campusSetup);
  await phone.locator("[data-campus-policy] [data-policy-row]").first().waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no sideways scroll at phone width");
  await shot(phone, "03-campus-policy-phone");
  await phone.close();
  const ar = await (await context("campus-ar")).newPage();
  await ar.goto(`${base}/group-policy`);
  await ar.waitForURL(campusSetup);
  await ar.locator('[data-policy-row="passingPercentage"]').waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  assert.match(await ar.locator('[data-policy-row="passingPercentage"]').innerText(), /[؀-ۿ]/);
  await shot(ar, "04-campus-policy-ar");
  await ar.close();
  const dub = await (await context("dubaiCampus")).newPage();
  await dub.goto(`${base}/group-policy`);
  await dub.waitForURL(campusSetup);
  await dub.locator("[data-policy-no-template], [data-policy-row]").first().waitFor();
  await shot(dub, "05-dubai-campus");
  await dub.close();
  // The principal and the teacher have no group-standards screen: home (§6.3).
  for (const [key, home] of [["principal", "/principal"], ["teacher", "/teacher"]] as const) {
    const page = await (await context(key)).newPage();
    await page.goto(`${base}/group-policy`);
    await page.waitForURL((target) => target.pathname === home);
    await page.close();
  }
});
