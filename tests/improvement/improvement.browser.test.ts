import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-450 on the isolated app with synthetic data: frameworks are versioned, school-configured references with
// approved interpretations; evidence points at a source version and goes stale when the source changes (one item
// mapped to two criteria makes both stale); actions reference the learning action without changing it, complete only
// with reviewed current evidence and never claim a cause; reviewers see only granted criteria and never open pupil
// or clinic sources; packs freeze a manifest whose digest verifies, keep their versions after a source changes, name
// their gaps, leak no pupil data and are re-authorized at download.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.IMPROVEMENT_TEST_APP || "http://localhost:3107";
const evidence = process.env.IMPROVEMENT_EVIDENCE_DIR || "/tmp/sko450-evidence";
const db = new PrismaClient(), password = "SyntheticEvidence450!";
const schoolId = `imp450-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), pupilId = randomUUID();
const PUPIL = "Synthetic Maryam Qureshi";
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
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
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const body = await r.text(); await ctx.close(); let json: { data?: any; error?: string } = {}; try { json = JSON.parse(body); } catch { /* */ } return { status: r.status(), json, body }; };
const post = (key: string, data: Record<string, unknown>) => call(key, "post", "/api/improvement", data);
const ws = async (key: string, frameworkId = ids.fw) => { const r = await call(key, "get", `/api/improvement?view=workspace&frameworkId=${frameworkId}`); assert.equal(r.status, 200, r.body); return r.json.data; };
const crit = (view: any, code: string) => view.criteria.find((c: any) => c.code === code);
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Evidence School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", timezone: "Asia/Karachi" } as never });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Evidence North", regId: campusId, city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await user("lead", "PRINCIPAL"); await user("lead2", "ADMIN"); await user("teacher", "TEACHER"); await user("reviewer", "TEACHER", "ar"); await user("nurse", "TEACHER"); await user("parent", "PARENT");
  await db.confidentialMember.create({ data: { schoolId, campusId, domain: "CLINIC", userId: users.get("nurse")!.id, role: "NURSE", grantedById: users.get("lead")!.id } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 4", section: "A", academicYear: 2026, classTeacherId: users.get("teacher")!.id } });
  await db.student.create({ data: { id: pupilId, schoolId, campusId, classId, fullName: PUPIL, rollNo: "451", gender: "OTHER", status: "active", enrollmentDate: new Date("2026-04-01T00:00:00Z") } as never });
  const plan = await db.interventionPlan.create({ data: { schoolId, campusId, studentId: pupilId, createdBy: users.get("teacher")!.id, title: `Fractions support for ${PUPIL}`, summary: "Synthetic plan", status: "ACTIVE", ownerId: users.get("teacher")!.id, privateNotes: "Synthetic private note" } });
  ids.plan = plan.id;
  ids.visit = (await db.clinicVisit.create({ data: { schoolId, campusId, studentId: pupilId, arrivedAt: new Date(), observation: "Synthetic headache", actionTaken: "Rest", outcome: "RETURNED_TO_CLASS", recordedById: users.get("nurse")!.id } })).id;
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
  await fetch(`${base}/api/improvement?view=workspace`).catch(() => undefined);
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("frameworks are versioned school references with approved interpretations; only leaders configure them", async () => {
  const criteria = [{ code: "L1", title: "Pupils make progress in mathematics" }, { code: "L2", title: "Support is matched to need" }, { code: "W1", title: "Pupils feel safe" }];
  assert.equal((await post("teacher", { action: "framework", name: "School review", version: "v2", criteria })).status, 403);
  const created = await post("lead", { action: "framework", name: "School review", version: "v2", criteria });
  assert.equal(created.status, 201, created.body); ids.fw = created.json.data.id;
  assert.equal((await post("lead", { action: "framework", name: "School review", version: "v2", criteria })).status, 409, "a version is unique");
  let view = (await ws("lead")).view;
  assert.equal(view.framework.version, "v2");
  assert.match(view.framework.disclaimer, /No accreditation outcome is implied/);
  assert.equal(view.summary.total, 3); assert.equal(view.summary.current, 0);
  assert.ok(crit(view, "L1").gaps.includes("Interpretation not yet approved"));
  for (const c of view.criteria) ids[c.code] = c.id;
  assert.equal((await post("teacher", { action: "interpretation", criterionId: ids.L1, interpretation: "Comparable assessments show progress from each pupil's starting point." })).status, 403);
  assert.equal((await post("lead", { action: "interpretation", criterionId: ids.L1, interpretation: "Comparable assessments show progress from each pupil's starting point." })).status, 200);
  view = (await ws("lead")).view;
  assert.equal(crit(view, "L1").interpretationApproved, true);
  assert.equal(crit(view, "L1").interpretationApprovedBy, "Synthetic lead");
  // A new version copies criteria and wording but the school approves its reading again.
  const v3 = await post("lead", { action: "framework", name: "School review", version: "v3", copyFrom: ids.fw, criteria: [{ code: "W2", title: "Attendance is improving" }] });
  assert.equal(v3.status, 201, v3.body); ids.fw3 = v3.json.data.id;
  const v3view = (await ws("lead", ids.fw3)).view;
  assert.deepEqual(v3view.criteria.map((c: any) => c.code), ["L1", "L2", "W1", "W2"]);
  assert.equal(crit(v3view, "L1").interpretation, "Comparable assessments show progress from each pupil's starting point.");
  assert.equal(crit(v3view, "L1").interpretationApproved, false);
  assert.equal((await call("parent", "get", "/api/improvement?view=workspace")).status, 403, "families never see the workspace");
});

test("evidence keeps its source version: one item on two criteria goes stale on both when the source changes", async () => {
  const item = await post("teacher", { action: "evidence", frameworkId: ids.fw, criterionIds: [ids.L1, ids.L2], sourceType: "INTERVENTION", sourceId: ids.plan, title: "Fractions group reassessed with a comparable quiz", reviewBy: day(90), audience: "EXTERNAL" });
  assert.equal(item.status, 201, item.body); ids.planItem = item.json.data.id;
  assert.equal(item.json.data.sourceVersion, "v1"); assert.equal(item.json.data.sensitivity, "PUPIL");
  let view = (await ws("lead")).view;
  assert.equal(crit(view, "L1").status, "UNVERIFIED", "an unreviewed link is not current evidence");
  assert.equal((await post("teacher", { action: "review", itemId: ids.planItem, decision: "ACCEPT" })).status, 403, "staff do not review");
  const reviewed = await post("lead", { action: "review", itemId: ids.planItem, decision: "ACCEPT", note: "Matches the quiz records." });
  assert.equal(reviewed.status, 200, reviewed.body);
  view = (await ws("lead")).view;
  assert.equal(crit(view, "L1").status, "CURRENT"); assert.equal(crit(view, "L2").status, "CURRENT");
  assert.equal(view.summary.current, 2);
  // A narrative note is unverified until someone else reviews it; its author cannot.
  const note = await post("lead2", { action: "evidence", frameworkId: ids.fw, criterionIds: [ids.W1], sourceType: "DOCUMENT", title: "Pupil voice survey summary", note: "Synthetic survey: most pupils report feeling safe at break.", reviewBy: day(-1), audience: "REVIEWER" });
  assert.equal(note.status, 201, note.body); ids.noteItem = note.json.data.id;
  assert.equal((await post("lead2", { action: "review", itemId: ids.noteItem, decision: "ACCEPT" })).status, 409, "authors never review their own evidence");
  view = (await ws("lead")).view;
  const w1 = crit(view, "W1");
  assert.equal(w1.items[0].narrativeOnly, true);
  assert.equal(w1.items[0].freshness, "EXPIRED", "past its review date");
  assert.equal(w1.status, "STALE");
  // The learning action changes in its own workflow (SKO-425); the link now shows it changed.
  await db.interventionPlan.update({ where: { id: ids.plan }, data: { version: 2, goal: "Synthetic revised goal" } });
  view = (await ws("lead")).view;
  for (const code of ["L1", "L2"]) {
    assert.equal(crit(view, code).status, "STALE", `${code} is stale`);
    assert.equal(crit(view, code).items[0].freshness, "SOURCE_CHANGED");
    assert.equal(crit(view, code).items[0].id, ids.planItem, "one canonical item behind both criteria");
  }
  const opened = await call("lead", "get", `/api/improvement?view=source&itemId=${ids.planItem}`);
  assert.equal(opened.json.data.current, false); assert.equal(opened.json.data.currentVersion, "v2");
  // Relinking the current version restores current evidence; reviewed contradicting evidence makes it a conflict.
  const relink = await post("teacher", { action: "evidence", frameworkId: ids.fw, criterionIds: [ids.L1], sourceType: "INTERVENTION", sourceId: ids.plan, title: "Fractions group reassessed (revised goal)", reviewBy: day(90), audience: "EXTERNAL" });
  ids.planItem2 = relink.json.data.id;
  await post("lead", { action: "review", itemId: ids.planItem2, decision: "ACCEPT" });
  const contra = await post("teacher", { action: "evidence", frameworkId: ids.fw, criterionIds: [ids.L2], sourceType: "DOCUMENT", title: "Support timetable clashes observed", note: "Synthetic observation: the support group missed three sessions.", stance: "CONTRADICTS", reviewBy: day(60), audience: "STAFF" });
  await post("lead", { action: "review", itemId: contra.json.data.id, decision: "ACCEPT" });
  const relinkL2 = await post("teacher", { action: "evidence", frameworkId: ids.fw, criterionIds: [ids.L2], sourceType: "INTERVENTION", sourceId: ids.plan, title: "Support matched to the revised goal", reviewBy: day(90), audience: "EXTERNAL" });
  await post("lead", { action: "review", itemId: relinkL2.json.data.id, decision: "ACCEPT" });
  view = (await ws("lead")).view;
  assert.equal(crit(view, "L1").status, "CURRENT");
  assert.equal(crit(view, "L2").status, "CONFLICTING", "a gap shown honestly, not averaged away");
  const more = await post("lead", { action: "review", itemId: ids.noteItem, decision: "REQUEST_MORE" });
  assert.equal(more.status, 400, "asking for more says what is needed");
  assert.equal((await post("lead", { action: "review", itemId: ids.noteItem, decision: "REQUEST_MORE", note: "Add the survey method and date." })).status, 200);
});

test("actions own a measure and completion evidence, reference the learning action without changing it, and claim no cause", async () => {
  const planBefore = await db.interventionPlan.findUniqueOrThrow({ where: { id: ids.plan } });
  assert.equal((await post("teacher", { action: "improvement", frameworkId: ids.fw, criterionIds: [ids.L1], title: "x", ownerId: users.get("teacher")!.id, dueDate: day(30), expectedMeasure: "Comparable quiz" })).status, 403);
  const a = await post("lead", { action: "improvement", frameworkId: ids.fw, criterionIds: [ids.L1, ids.L2], title: "Fractions support", ownerId: users.get("teacher")!.id, dueDate: day(30), expectedMeasure: "Comparable fractions quiz, same paper format", interventionPlanId: ids.plan, milestones: [{ label: "Baseline quiz", date: day(-10) }] });
  assert.equal(a.status, 201, a.body); ids.action = a.json.data.id;
  let act = (await ws("teacher")).view.actions.find((x: any) => x.id === ids.action);
  assert.equal(act.outcome.state, "NOT_REASSESSED"); assert.match(act.outcome.text, /no outcome claimed/);
  assert.equal(act.learningAction.status, "ACTIVE");
  assert.equal((await post("teacher", { action: "complete", actionId: ids.action, expectedVersion: 1, evidenceId: ids.noteItem })).status, 409, "unreviewed evidence cannot complete");
  assert.equal((await post("teacher", { action: "complete", actionId: ids.action, expectedVersion: 1, evidenceId: ids.planItem })).status, 409, "stale evidence cannot complete");
  const f = await post("teacher", { action: "follow-up", actionId: ids.action, expectedVersion: 1, milestoneDone: [0], reassessment: { measure: "Fractions quiz", baseline: "42%", followUp: "61%", comparable: true }, reflection: "Small-group practice was consistent." });
  assert.equal(f.status, 200, f.body);
  assert.equal((await post("teacher", { action: "follow-up", actionId: ids.action, expectedVersion: 1, reflection: "late" })).status, 409, "a stale version is refused");
  act = (await ws("teacher")).view.actions.find((x: any) => x.id === ids.action);
  assert.equal(act.outcome.state, "OBSERVED"); assert.match(act.outcome.text, /42% → 61% · Observed change · cause not established/);
  assert.equal(act.milestones[0].done, true);
  const done = await post("teacher", { action: "complete", actionId: ids.action, expectedVersion: 2, evidenceId: ids.planItem2 });
  assert.equal(done.status, 200, done.body);
  const planAfter = await db.interventionPlan.findUniqueOrThrow({ where: { id: ids.plan } });
  assert.deepEqual([planAfter.status, planAfter.version, planAfter.outcome], [planBefore.status, planBefore.version, planBefore.outcome], "the learning action is untouched");
  // An incomplete reassessment stays incomplete beside a completed one; an overdue action is flagged.
  const b = await post("lead", { action: "improvement", frameworkId: ids.fw, criterionIds: [ids.W1], title: "Break-time supervision review", ownerId: users.get("lead2")!.id, dueDate: day(-3), expectedMeasure: "Repeat pupil voice survey" });
  ids.action2 = b.json.data.id;
  await post("lead2", { action: "follow-up", actionId: ids.action2, expectedVersion: 1, reassessment: { measure: "Survey", baseline: "70% safe", followUp: "Different questions", comparable: false } });
  const actions = (await ws("lead")).view.actions;
  const b2 = actions.find((x: any) => x.id === ids.action2);
  assert.equal(b2.overdue, true); assert.equal(b2.outcome.state, "NOT_COMPARABLE");
  assert.equal(actions.find((x: any) => x.id === ids.action).status, "COMPLETED");
  assert.equal((await post("teacher", { action: "follow-up", actionId: ids.action2, expectedVersion: 2, reflection: "not mine" })).status, 403, "only the owner or a leader");
});

test("restricted sources: clinic links need the clinic team and stay staff-only; reviewers see granted criteria and never open pupil records", async () => {
  assert.equal((await post("teacher", { action: "evidence", frameworkId: ids.fw, criterionIds: [ids.W1], sourceType: "CLINIC_VISIT", sourceId: ids.visit, title: "Clinic link attempt", reviewBy: day(30) })).status, 403);
  const clinic = await post("nurse", { action: "evidence", frameworkId: ids.fw, criterionIds: [ids.W1], sourceType: "CLINIC_VISIT", sourceId: ids.visit, title: "Clinic visits at break fell", reviewBy: day(30), audience: "EXTERNAL" });
  assert.equal(clinic.status, 201, clinic.body); ids.clinicItem = clinic.json.data.id;
  assert.equal(clinic.json.data.audience, "STAFF", "clinic evidence never leaves staff"); assert.equal(clinic.json.data.sensitivity, "CLINIC");
  const leadView = (await ws("lead")).view;
  const asLead = crit(leadView, "W1").items.find((i: any) => i.id === ids.clinicItem);
  assert.equal(asLead.restricted, true, "a leader outside the clinic team sees it as restricted"); assert.equal(asLead.title, null); assert.equal(asLead.sourceId, null);
  assert.equal((await call("lead", "get", `/api/improvement?view=source&itemId=${ids.clinicItem}`)).status, 403);
  // Narrow reviewer access: L1 only.
  const g = await post("lead", { action: "grant", frameworkId: ids.fw, userId: users.get("reviewer")!.id, criterionIds: [ids.L1], expiresAt: day(14) });
  assert.equal(g.status, 201, g.body); ids.grant = g.json.data.id;
  assert.equal((await post("lead", { action: "grant", frameworkId: ids.fw, userId: users.get("parent")!.id, criterionIds: [ids.L1], expiresAt: day(14) })).status, 404, "families are never reviewers");
  const rv = await ws("reviewer");
  assert.equal(rv.mode, "REVIEWER");
  assert.deepEqual(rv.view.criteria.map((c: any) => c.code), ["L1"]);
  const pupilItem = rv.view.criteria[0].items.find((i: any) => i.id === ids.planItem2);
  assert.equal(pupilItem.restricted, true); assert.equal(pupilItem.title, null); assert.equal(pupilItem.sourceId, null);
  const blocked = await call("reviewer", "get", `/api/improvement?view=source&itemId=${ids.planItem2}`);
  assert.equal(blocked.status, 403); assert.match(blocked.json.error!, /cannot open its restricted source/);
  assert.equal((await call("reviewer", "get", `/api/improvement?view=source&itemId=${ids.clinicItem}`)).status, 404, "outside the grant it does not exist");
  assert.ok(!JSON.stringify(rv).includes(PUPIL) && !JSON.stringify(rv).includes(pupilId) && !JSON.stringify(rv).includes(ids.plan), "no pupil identifiers reach a reviewer");
  assert.equal((await post("reviewer", { action: "evidence", frameworkId: ids.fw, criterionIds: [ids.L1], sourceType: "DOCUMENT", title: "Reviewer note attempt", note: "Synthetic reviewer note text", reviewBy: day(5) })).status, 403, "reviewers comment; staff add");
  // Reviewers can review shared evidence within their grant, and their feedback is kept.
  const shared = await post("teacher", { action: "evidence", frameworkId: ids.fw, criterionIds: [ids.L1], sourceType: "DOCUMENT", title: "Department moderation notes", note: "Synthetic moderation of quiz marking across two classes.", reviewBy: day(60), audience: "REVIEWER" });
  ids.sharedItem = shared.json.data.id;
  assert.equal((await post("reviewer", { action: "review", itemId: ids.noteItem, decision: "ACCEPT" })).status, 403, "W1 is outside the grant");
  assert.equal((await post("reviewer", { action: "review", itemId: ids.sharedItem, decision: "REQUEST_MORE", note: "Include the moderation sample size." })).status, 200);
  assert.equal(crit((await ws("lead")).view, "L1").items.find((i: any) => i.id === ids.sharedItem).reviewNote, "Include the moderation sample size.");
});

test("packs freeze versions, name gaps, redact pupil and clinic data, verify by digest and re-check access at download", async () => {
  assert.equal((await post("teacher", { action: "export", frameworkId: ids.fw, audience: "EXTERNAL" })).status, 403);
  const p1 = await post("lead", { action: "export", frameworkId: ids.fw, audience: "EXTERNAL" });
  assert.equal(p1.status, 201, p1.body); assert.equal(p1.json.data.version, 1);
  const d1 = await call("lead", "get", `/api/improvement?view=pack&id=${p1.json.data.id}`);
  const m = d1.json.data.manifest;
  assert.equal(createHash("sha256").update(stable(m)).digest("hex"), d1.json.data.digest, "anyone can check the digest");
  assert.equal(d1.json.data.verified, true);
  const raw = JSON.stringify(m);
  for (const secret of [PUPIL, pupilId, ids.plan, ids.visit, "Synthetic private note", "Synthetic headache", "Support timetable clashes"]) assert.ok(!raw.includes(secret), `pack leaks ${secret}`);
  assert.ok(m.notices.some((n: string) => /No accreditation outcome is implied/.test(n)));
  assert.ok(m.gaps.some((g: string) => g.startsWith("L2:")) && m.gaps.some((g: string) => g.startsWith("W1:")), "missing and stale evidence is named");
  assert.ok(m.exclusions.itemsNotForThisAudience >= 2, "staff-only items are counted, not shown");
  assert.ok(m.criteria.find((c: any) => c.code === "L1").items.every((i: any) => i.reviewNote === null), "reviewer notes stay internal");
  const l1Items = m.criteria.find((c: any) => c.code === "L1").items;
  assert.ok(l1Items.some((i: any) => i.restricted && i.sourceType === "INTERVENTION" && i.freshness === "CURRENT"), "restricted but traceable by type, version and date");
  // A later source change does not alter version 1; a new export shows it.
  await db.interventionPlan.update({ where: { id: ids.plan }, data: { version: 3 } });
  const again = await call("lead", "get", `/api/improvement?view=pack&id=${p1.json.data.id}`);
  assert.equal(again.json.data.digest, d1.json.data.digest); assert.equal(stable(again.json.data.manifest), stable(m));
  const p2 = await post("lead", { action: "export", frameworkId: ids.fw, audience: "EXTERNAL" });
  assert.equal(p2.json.data.version, 2);
  const m2 = (await call("lead", "get", `/api/improvement?view=pack&id=${p2.json.data.id}`)).json.data.manifest;
  assert.equal(m2.criteria.find((c: any) => c.code === "L1").status, "STALE");
  // Reviewer packs: only external packs within the grant, checked again at every download.
  const scoped = await post("lead", { action: "export", frameworkId: ids.fw, audience: "EXTERNAL", criterionIds: [ids.L1] });
  assert.equal((await call("reviewer", "get", `/api/improvement?view=pack&id=${scoped.json.data.id}`)).status, 200);
  assert.equal((await call("reviewer", "get", `/api/improvement?view=pack&id=${p1.json.data.id}`)).status, 404, "a pack beyond the grant does not exist for them");
  const staffPack = await post("lead", { action: "export", frameworkId: ids.fw, audience: "STAFF" });
  const sm = JSON.stringify((await call("lead", "get", `/api/improvement?view=pack&id=${staffPack.json.data.id}`)).json.data.manifest);
  assert.ok(!sm.includes(PUPIL) && !sm.includes(pupilId) && !sm.includes("Synthetic headache"), "a staff pack still leaves pupil and clinic records out");
  assert.ok(sm.includes("Support timetable clashes"), "staff-only evidence goes in the staff pack");
  assert.equal((await call("reviewer", "get", `/api/improvement?view=pack&id=${staffPack.json.data.id}`)).status, 404);
  assert.equal((await post("lead", { action: "revoke", id: ids.grant })).status, 200);
  assert.ok([403, 404].includes((await call("reviewer", "get", `/api/improvement?view=pack&id=${scoped.json.data.id}`)).status), "revoked access cannot download a pack prepared earlier");
  assert.equal((await ws("reviewer")).mode, "STAFF");
  assert.equal(await db.evidencePack.count({ where: { frameworkId: ids.fw } }), 4, "no duplicate or mis-scoped bundles");
  assert.ok(await db.auditLog.count({ where: { schoolId, tableName: "evidence_packs" } }) >= 6, "exports and downloads are audited");
  // Restore the grant for the screens.
  ids.grant = (await post("lead", { action: "grant", frameworkId: ids.fw, userId: users.get("reviewer")!.id, criterionIds: [ids.L1], expiresAt: day(14) })).json.data.id;
});

test("screens: evidence map with gaps, interpretation and export for the leader; staff add a note; Arabic reviewer on a phone", async () => {
  const lead = await (await context("lead")).newPage();
  await lead.goto(`${base}/improvement`);
  await lead.locator("[data-improvement]").waitFor({ timeout: 60_000 });
  await lead.locator("[data-framework-select]").selectOption(ids.fw);
  await lead.locator("[data-summary-current]", { hasText: "of 3" }).waitFor();
  assert.match(await lead.locator("[data-summary-current]").innerText(), /Current: \d of 3/);
  assert.match(await lead.locator('[data-tour="page.header"]').innerText(), /No accreditation outcome is implied/);
  await lead.locator('[data-criterion-toggle="L2"]').click();
  await lead.locator('[data-criterion="L2"] [data-criterion-gaps]').waitFor();
  await lead.locator('[data-interpret-open="L2"]').click();
  await lead.locator("[data-interpret-text]").fill("Support plans name the need, the owner and the review date.");
  await lead.locator("[data-interpret-save]").click();
  await lead.locator("[data-interpret-form]").waitFor({ state: "detached" });
  await lead.locator('[data-criterion="L2"]').getByText("School interpretation approved").waitFor();
  await lead.locator("[data-review-gaps]").click();
  await shot(lead, "01-evidence-map-gaps");
  await lead.locator("[data-review-gaps]").click();
  await lead.locator(`[data-action="${ids.action}"] [data-outcome-text]`).scrollIntoViewIfNeeded();
  assert.match(await lead.locator(`[data-action="${ids.action}"] [data-outcome-text]`).innerText(), /cause not established/);
  await shot(lead, "02-action-outcome-review");
  await lead.getByRole("button", { name: "Export a versioned pack" }).click();
  await lead.locator("[data-export-save]").click();
  await lead.locator("[data-export-result]").waitFor();
  assert.match(await lead.locator("[data-export-result]").innerText(), /Evidence pack version 5 created with \d+ clearly marked gaps/);
  await shot(lead, "03-export-receipt");
  await lead.locator("[data-export-close]").click();
  await lead.locator('[data-pack="5"]').waitFor();
  await lead.close();

  const teacher = await (await context("teacher", { width: 390, height: 844 })).newPage();
  await teacher.goto(`${base}/improvement`);
  await teacher.locator("[data-framework-select]").selectOption(ids.fw);
  await teacher.locator("[data-summary-current]", { hasText: "of 3" }).waitFor();
  await teacher.locator('[data-criterion-toggle="W1"]').click();
  await teacher.locator('[data-evidence-add-for="W1"]').click();
  await teacher.locator("[data-evidence-type]").selectOption("DOCUMENT");
  await teacher.locator("[data-evidence-title]").fill("Lunchtime club attendance log");
  await teacher.locator("[data-evidence-note]").fill("Synthetic log: club attendance doubled this term.");
  await teacher.locator("[data-evidence-save]").click();
  await teacher.locator("[data-evidence-form]").waitFor({ state: "detached" });
  await teacher.getByText("Lunchtime club attendance log").first().waitFor();
  assert.equal(await teacher.locator("[data-review-open]").count(), 0, "staff add evidence; they do not review it");
  assert.equal(await teacher.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no horizontal scroll on a phone");
  await shot(teacher, "04-staff-adds-note-phone");
  await teacher.close();

  const rv = await (await context("reviewer", { width: 390, height: 844 })).newPage();
  await rv.goto(`${base}/improvement`);
  await rv.locator('[data-improvement][data-mode="REVIEWER"]').waitFor({ timeout: 60_000 });
  assert.equal(await rv.evaluate(() => document.documentElement.dir), "rtl");
  assert.equal(await rv.locator("[data-criterion]").count(), 1);
  await rv.locator('[data-criterion-toggle="L1"]').click();
  const restricted = rv.locator('[data-evidence-item][data-restricted="true"]').first();
  await restricted.waitFor();
  assert.match(await restricted.innerText(), /مصدر مقيد/);
  await restricted.locator("[data-open-source]").click();
  await rv.getByText("يمكنك مراجعة هذا المعيار لكن لا يمكنك فتح مصدره المقيد.").first().waitFor();
  assert.ok(!(await rv.content()).includes(PUPIL));
  assert.equal(await rv.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  await shot(rv, "05-reviewer-ar-phone-restricted");
  await rv.close();
});
