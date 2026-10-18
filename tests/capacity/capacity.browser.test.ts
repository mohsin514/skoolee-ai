import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { appendEvent, dispatch } from "../../src/lib/queue/outbox";
import { snapshot, summarize } from "../../src/lib/capacity/telemetry";
import { evaluate } from "../../src/lib/capacity/objectives";
import { ISOLATED, peakFixtures, runMorningPeak, signIn, type PeakFixtures } from "./peak-profile";

// SKO-451 on the isolated app with synthetic data: fair per-school dispatch with critical work first; per-school
// admission that answers 429 with a retry time while critical and interactive work carry on; operator-only policy
// changes that are scoped, expiring, audited and reversible; telemetry that says when it is stale or unavailable;
// and a recorded morning-peak run whose report carries workload, dataset, environment, percentiles and objectives.
if (process.env.DATABASE_URL !== ISOLATED) throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.CAPACITY_TEST_APP || "http://localhost:3107";
const evidence = process.env.CAPACITY_EVIDENCE_DIR || "/tmp/sko451-evidence";
const db = new PrismaClient(), password = "SyntheticCapacity451!";
const opsSchool = `cap-ops-${randomUUID()}`, schoolA = `cap-a-${randomUUID()}`, schoolB = `cap-b-${randomUUID()}`;
const people = new Map<string, { email: string; cookie?: string }>();
let browser: Browser, fx: PeakFixtures;
const created: string[] = [];

async function school(id: string, name: string) {
  await db.school.create({ data: { id, name, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } as never });
  const campusId = randomUUID(); await db.campus.create({ data: { id: campusId, schoolId: id, name: `${name} campus`, regId: campusId, city: "Lahore" } });
  created.push(id); return campusId;
}
async function person(key: string, schoolId: string, campusId: string | null, role: string, language = "en") {
  const email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { email, password: await bcrypt.hash(password, 10), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, { email });
}
const cookie = async (key: string) => { const p = people.get(key)!; return (p.cookie ??= await signIn(base, p.email, password)); };
const ops = async (key: string, method: "GET" | "POST", body?: unknown) => {
  const r = await fetch(base + "/api/owner/capacity", { method, headers: { Cookie: await cookie(key), Origin: base, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) as { data?: any; error?: string } };
};
const req = async (c: string, path: string, init: { method?: string; body?: unknown } = {}) => {
  const r = await fetch(base + path, { method: init.method ?? "GET", headers: { Cookie: c, Origin: base, "Content-Type": "application/json" }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: r.status, json, text, retryAfter: r.headers.get("retry-after") };
};
const inHour = () => new Date(Date.now() + 3_600_000).toISOString();
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };

before(async () => {
  const opsCampus = await school(opsSchool, "Synthetic Platform Operations");
  await person("operator", opsSchool, opsCampus, "APP_OWNER"); await person("operator-ar", opsSchool, opsCampus, "APP_OWNER", "ar"); await person("admin", opsSchool, opsCampus, "ADMIN");
  await school(schoolA, "Synthetic Queue School A"); await school(schoolB, "Synthetic Queue School B");
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  // Clear policies left by earlier runs of this suite so defaults are what we measure against.
  await db.resourcePolicy.updateMany({ where: { revokedAt: null, reason: { startsWith: "Synthetic" } }, data: { revokedAt: new Date(), revokeReason: "test reset" } });
  fx = await peakFixtures(db, base, { pupils: 8, noisyStudents: 1200 });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close(); await fx?.cleanup();
  // Platform records this suite created: its operators' recorded runs and policy rows.
  const operators = (await db.user.findMany({ where: { schoolId: opsSchool, role: "APP_OWNER" }, select: { id: true } })).map(u => u.id);
  await db.performanceRun.deleteMany({ where: { recordedById: { in: operators } } });
  await db.resourcePolicy.deleteMany({ where: { OR: [{ createdById: { in: [...operators, "synthetic-operator"] } }, { targetSchoolId: { in: [fx?.noisy.schoolId, fx?.quiet.schoolId, schoolA, schoolB].filter((x): x is string => !!x) } }] } });
  await db.superAdminAuditLog.deleteMany({ where: { userId: { in: operators } } });
  await db.resourcePolicy.updateMany({ where: { revokedAt: null, reason: { startsWith: "Synthetic" } }, data: { revokedAt: new Date(), revokeReason: "test cleanup" } });
  for (const id of created) await db.school.delete({ where: { id } }).catch(() => undefined);
  await db.$disconnect();
});

test("dispatch is fair: one school's backlog cannot hold the batch, background waits at its limit, critical work goes first", async () => {
  const ev = (school: string, kind: string) => db.$transaction(tx => appendEvent(tx, { schoolId: school, actorId: "synthetic-actor", referenceId: "synthetic-ref", kind, version: 1, identity: randomUUID() }));
  const a: string[] = []; for (let i = 0; i < 40; i++) a.push(await ev(schoolA, "ACTIVITY_SYNTHETIC_EXPORT"));
  const b = [await ev(schoolB, "REPORT_DELIVERY"), await ev(schoolB, "ACTIVITY_SYNTHETIC_EXPORT")];
  const critical = await ev(schoolA, "PAYMENT_CONFIRMATION");
  const mine = [...a, ...b, critical];
  await db.$executeRaw`UPDATE workflow_events SET available_at = now() - interval '10 seconds' WHERE id = ANY(${mine})`;
  await db.$executeRaw`UPDATE workflow_events SET available_at = now() - interval '1 second' WHERE id = ${critical}`;
  // Other suites' events must not be touched by this pass: hold everything else back for its duration.
  const others = await db.$queryRaw<{ id: string }[]>`SELECT id FROM workflow_events WHERE available_at <= now() AND NOT (id = ANY(${mine}))`;
  await db.$executeRaw`UPDATE workflow_events SET available_at = available_at + interval '1 hour' WHERE id = ANY(${others.map(o => o.id)})`;
  try {
    const published: { schoolId: string; eventId: string; priority: number }[] = [];
    await dispatch(db as never, async (ref, _d, meta) => { published.push({ ...ref, priority: meta.priority }); }, 50);
    const fromA = published.filter(p => p.schoolId === schoolA), fromB = published.filter(p => p.schoolId === schoolB);
    assert.equal(fromB.length, 2, "the quiet school's events are dispatched in the same pass");
    assert.equal(fromA.filter(p => p.eventId !== critical).length, 3, "the busy school's background stops at its default limit of 3");
    assert.equal(published[0].eventId, critical, "critical work is published first"); assert.equal(published[0].priority, 1);
    const aBackground = published.map((p, i) => ({ ...p, i })).filter(p => p.schoolId === schoolA && p.eventId !== critical);
    assert.ok(published.findIndex(p => p.schoolId === schoolB) < aBackground[1].i, "round-robin: B's first event is not behind A's backlog");
    // The busy school is now at its limit: nothing more of its background is dispatched until work finishes,
    // but a new critical event still goes out.
    const critical2 = await ev(schoolA, "EXAM_SUBMISSION_RECEIPT");
    await db.$executeRaw`UPDATE workflow_events SET available_at = now() - interval '1 second' WHERE id = ${critical2}`;
    const second: string[] = [];
    await dispatch(db as never, async ref => { if (ref.schoolId === schoolA) second.push(ref.eventId); }, 50);
    assert.deepEqual(second, [critical2], "background held at the limit; critical not held");
    // A tighter school-scoped job policy applies on the next pass.
    await db.$executeRaw`UPDATE workflow_events SET dispatched_at = now() - interval '5 minutes', available_at = now() - interval '1 second', lease_until = NULL WHERE school_id = ${schoolA}`;
    const policy = await db.resourcePolicy.create({ data: { targetSchoolId: schoolA, scope: "BACKGROUND_JOBS", limitValue: 1, reason: "Synthetic dispatch fairness check", expiresAt: new Date(Date.now() + 600_000), createdById: "synthetic-operator" } });
    const third: string[] = [];
    await dispatch(db as never, async ref => { if (ref.schoolId === schoolA) third.push(ref.eventId); }, 50);
    assert.equal(third.filter(id => a.includes(id)).length, 1);
    await db.resourcePolicy.update({ where: { id: policy.id }, data: { revokedAt: new Date(), revokeReason: "test" } });
    // No durable work is dropped: every event is still queued or dispatched, none failed.
    assert.equal(await db.workflowJob.count({ where: { schoolId: { in: [schoolA, schoolB] }, state: "failed" } }), 0);
    assert.equal(await db.workflowEvent.count({ where: { schoolId: { in: [schoolA, schoolB] } } }), 44);
  } finally {
    await db.$executeRaw`UPDATE workflow_events SET available_at = available_at - interval '1 hour' WHERE id = ANY(${others.map(o => o.id)})`;
  }
});

test("policy changes are operator-only, scoped, expiring, audited and reversible", async () => {
  assert.equal((await ops("admin", "GET")).status, 403);
  assert.equal((await ops("admin", "POST", { action: "apply", scope: "BACKGROUND_REQUESTS", limitValue: 0, reason: "Synthetic not allowed", targetSchoolId: fx.noisy.schoolId, expiresAt: inHour() })).status, 403);
  assert.equal((await ops("operator", "POST", { action: "apply", scope: "BACKGROUND_REQUESTS", limitValue: 0, reason: "Synthetic incident without an end", targetSchoolId: fx.noisy.schoolId })).status, 400, "a school-scoped change must expire");
  assert.equal((await ops("operator", "POST", { action: "apply", scope: "BACKGROUND_REQUESTS", limitValue: 0, reason: "short", targetSchoolId: fx.noisy.schoolId, expiresAt: inHour() })).status, 400, "a reason is required");
  const applied = await ops("operator", "POST", { action: "apply", scope: "BACKGROUND_REQUESTS", limitValue: 0, reason: "Synthetic incident: roster export contention", targetSchoolId: fx.noisy.schoolId, expiresAt: inHour() });
  assert.equal(applied.status, 201, JSON.stringify(applied.json));
  assert.equal(applied.json.data.before.limit, 2); assert.equal(applied.json.data.after.limit, 0);
  assert.match(applied.json.data.message, /follow-up measurement is required/);
  const r = (await ops("operator", "GET")).json.data;
  assert.equal(r.followUpRequired, true);
  assert.ok(r.policy.active.some((p: any) => p.id === applied.json.data.id && p.schoolName === "Synthetic Busy Export School"));
  const audit = await db.superAdminAuditLog.findFirst({ where: { action: "capacity_policy_apply", targetId: applied.json.data.id } });
  assert.deepEqual([(audit!.oldValues as any).limit, (audit!.newValues as any).limit], [2, 0]);
  // The other school is untouched by a scoped change.
  assert.equal((await req(fx.quiet.admin, "/api/students/export")).status, 200);
  const refused = await req(fx.noisy.admin, "/api/students/export");
  assert.equal(refused.status, 429); assert.equal(refused.retryAfter, "10");
  assert.equal(refused.json.code, "BACKGROUND_LIMIT");
  assert.match(refused.json.error, /Background exports are limited; interactive school work remains prioritized/);
  const reverted = await ops("operator", "POST", { action: "revert", id: applied.json.data.id, reason: "Synthetic incident closed" });
  assert.equal(reverted.status, 200); assert.equal(reverted.json.data.after.limit, 2);
  assert.equal((await ops("operator", "POST", { action: "revert", id: applied.json.data.id, reason: "again please" })).status, 409);
  assert.ok(await db.superAdminAuditLog.findFirst({ where: { action: "capacity_policy_revert", targetId: applied.json.data.id } }));
  const back = await req(fx.noisy.admin, "/api/students/export");
  assert.equal(back.status, 200, "the previous limit applies again"); assert.match(back.text, /Synthetic roster pupil 1/);
});

test("backpressure answers at once; exam saves and attendance in the same school are never shed", async () => {
  const p = await ops("operator", "POST", { action: "apply", scope: "BACKGROUND_REQUESTS", limitValue: 0, reason: "Synthetic incident: quiet school export freeze", targetSchoolId: fx.quiet.schoolId, expiresAt: inHour() });
  try {
    const t0 = Date.now();
    const refused = await req(fx.quiet.admin, "/api/students/export");
    assert.equal(refused.status, 429); assert.ok(Date.now() - t0 < 5000, "refused immediately, not after a wait");
    const pupil = fx.quiet.pupils[0];
    const save = await req(pupil.cookie, `${fx.exam}/attempt`, { method: "PATCH", body: { sequence: pupil.sequence + 1, responses: { q1: "a1", q3: "Synthetic save during freeze" }, submit: false } });
    assert.equal(save.status, 200, "critical work is not limited by background policy"); pupil.sequence = save.json.attempt.sequence;
    const mark = await req(fx.quiet.teacher, "/api/attendance/register", { method: "POST", body: { classId: fx.quiet.classId, date: fx.today, entries: [{ studentId: fx.quiet.pupils[1].studentId, status: "PRESENT", knownStatus: null }] } });
    assert.equal(mark.status, 200, JSON.stringify(mark.json));
    const again = await req(pupil.cookie, `${fx.exam}/attempt`, { method: "PATCH", body: { sequence: pupil.sequence + 1, responses: { q1: "a1", q3: "Synthetic save during freeze" }, submit: false } });
    assert.equal(again.status, 200); pupil.sequence = again.json.attempt.sequence;
    // A stale save is refused, never silently applied, and the server keeps the acknowledged answer.
    const stale = await req(pupil.cookie, `${fx.exam}/attempt`, { method: "PATCH", body: { sequence: pupil.sequence - 1, responses: { q3: "Synthetic stale" }, submit: false } });
    assert.equal(stale.status, 409);
    const stored = await db.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: fx.quiet.assignmentId, studentId: pupil.studentId } });
    assert.equal((stored.responses as Record<string, string>).q3, "Synthetic save during freeze");
  } finally { await ops("operator", "POST", { action: "revert", id: p.json.data.id, reason: "Synthetic freeze lifted" }); }
});

test("telemetry separates measurement from its absence: no samples, stale and unavailable are never 'healthy'", async () => {
  const local = snapshot();
  assert.equal(local.state, "NO_MEASUREMENT", "a process with no requests has no measurement");
  assert.equal(summarize([]).p95, null);
  const { databasePressure } = await import("../../src/lib/capacity/service");
  const down = await databasePressure({ $queryRaw: (() => Promise.reject(new Error("synthetic outage"))) as never });
  assert.equal(down.available, false); assert.match((down as { reason: string }).reason, /do not infer healthy service/);
  const live = (await ops("operator", "GET")).json.data;
  assert.equal(live.requests.state, "MEASURED");
  assert.equal(live.requests.scope, "This application instance");
  assert.ok(live.requests.classes.find((c: any) => c.serviceClass === "CRITICAL").count >= 1);
  assert.equal(live.database.available, true); assert.ok(live.database.maxConnections > 0);
  assert.ok(!JSON.stringify(live.requests).includes("Synthetic save during freeze"), "no request bodies in telemetry");
  const unmeasured = evaluate({ results: {}, backgroundPeaks: [] });
  assert.ok(unmeasured.every(o => o.pass === null), "an objective with no samples is unmeasured, not passed");
});

test("morning peak: measured before and after a scoped limit; the noisy school stays within it while exam saves and attendance meet their objectives", async () => {
  // Before: the documented default limit (2 concurrent background requests per school). Recorded whatever it shows.
  const before = await runMorningPeak(base, await cookie("operator"), fx, { durationMs: 15_000, noisyConcurrency: 6, outDir: evidence, noisyStudents: 1200 });
  const beforePeak = before.report.backgroundPeaks.find(b => b.schoolId === fx.noisy.schoolId)!;
  assert.ok(beforePeak.peak <= 2 && beforePeak.limit === 2, `default limit held: peak ${beforePeak.peak}`);
  // Runbook: the operator limits the noisy school for the incident, then re-measures.
  const p = await ops("operator", "POST", { action: "apply", scope: "BACKGROUND_REQUESTS", limitValue: 1, reason: "Synthetic incident: roster export contention during the morning peak", targetSchoolId: fx.noisy.schoolId, expiresAt: inHour() });
  assert.equal(p.status, 201);
  assert.equal((await ops("operator", "GET")).json.data.followUpRequired, true);
  const out = await runMorningPeak(base, await cookie("operator"), fx, { durationMs: 15_000, noisyConcurrency: 6, outDir: evidence, noisyStudents: 1200 });
  const w = out.report.results as Record<string, any>;
  assert.ok(w["noisy-roster-export"].rejected > 0, "the noisy school was refused with 429 once at its limit");
  assert.equal(w["quiet-roster-export"].rejected, 0, "the other school's export was never refused");
  assert.ok(w["exam-answer-save"].count >= 50 && w["attendance-register"].count >= 20, "real volume ran");
  assert.equal(w["exam-answer-save"].rejected, 0); assert.equal(w["attendance-register"].rejected, 0);
  // SKO-492: the teacher's known marks carry across warm-up, quiet and noisy phases, so no write is stale.
  for (const run of [before, out]) {
    assert.equal(((run.report.results as Record<string, any>)["attendance-register"].statusCounts["409"] ?? 0), 0, "no artificial conflicts in the noisy phase");
    assert.equal(((run.report.baseline as Record<string, any>)["attendance-register"].statusCounts["409"] ?? 0), 0, "no artificial conflicts in the quiet phase");
  }
  // A genuinely stale write is still a conflict.
  const now = (await db.attendance.findFirstOrThrow({ where: { studentId: fx.quiet.pupils[0].studentId } })).status;
  const stale = await req(fx.quiet.teacher, "/api/attendance/register", { method: "POST", body: { classId: fx.quiet.classId, date: fx.today, entries: [{ studentId: fx.quiet.pupils[0].studentId, status: now === "PRESENT" ? "ABSENT" : "PRESENT", knownStatus: now === "PRESENT" ? "ABSENT" : "PRESENT" }] } });
  assert.equal(stale.status, 409, "a write against a status the teacher never saw is refused");
  const noisyPeak = out.report.backgroundPeaks.find(b => b.schoolId === fx.noisy.schoolId)!;
  assert.ok(noisyPeak.peak <= 1 && noisyPeak.limit === 1, `server-measured peak ${noisyPeak.peak} within the incident limit`);
  // Gated: what the fairness controls decide, compared within the same run so the shared machine's own load
  // affects both sides. Absolute p95 targets describe the declared release environment; they are measured and
  // reported as PASS or FAIL here but not gated, since this developer machine is shared.
  for (const key of ["critical_error_rate", "interactive_error_rate", "critical_fairness_ratio", "interactive_fairness_ratio", "background_within_limit", "no_hung_requests"]) {
    const o = out.objectives.find(x => x.key === key)!;
    assert.notEqual(o.observed, null, `${key} measured`);
    assert.equal(o.pass, true, `${key}: observed ${o.observed} vs ${o.target} (before the limit: ${before.objectives.find(x => x.key === key)!.observed})`);
  }
  for (const key of ["critical_p95_ms", "interactive_p95_ms"]) assert.notEqual(out.objectives.find(x => x.key === key)!.observed, null, `${key} measured`);
  assert.equal(out.recorded.passed, out.objectives.every(o => o.pass === true), "a run passes only when every objective does");
  // Save integrity: what the server holds is the last answer each pupil was told was saved.
  for (const pupil of fx.quiet.pupils) {
    const a = await db.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: fx.quiet.assignmentId, studentId: pupil.studentId } });
    assert.equal(a.sequence, pupil.sequence, "acknowledged sequence equals the stored sequence");
  }
  const md = await readFile(`${evidence}/${out.report.runId}.md`, "utf8");
  for (const s of ["Profile:", "Release:", "Environment:", "Dataset:", "Concurrency:", "| Objective |", "p95 ms", "Quiet baseline p95", "Resource policies in force", "Runbook", "not a capacity claim"]) assert.ok(md.includes(s), `report has ${s}`);
  assert.equal((await ops("operator", "POST", { action: "record-run", ...out.report })).status, 409, "a run id is recorded once");
  // Explicitly tested limit: a client that ignores Retry-After. Concurrency stays bounded; its request rate is
  // reported, not gated here, because limiting it belongs at the edge.
  const flood = await runMorningPeak(base, await cookie("operator"), fx, { durationMs: 9_000, noisyConcurrency: 6, outDir: evidence, noisyStudents: 1200, ignoreRetryAfter: true });
  const floodPeak = flood.report.backgroundPeaks.find(b => b.schoolId === fx.noisy.schoolId)!;
  assert.ok(floodPeak.peak <= 1, "even a flooding client never exceeds its concurrent limit");
  assert.ok((flood.report.results as Record<string, any>)["noisy-roster-export"].rejected > 100, "the flood is refused at once, request by request");
  assert.match(flood.report.notes, /needs an edge rate limit/);
  const after = (await ops("operator", "GET")).json.data;
  assert.equal(after.followUpRequired, false, "the change is followed by a measured run");
  assert.deepEqual(after.runs.slice(0, 3).map((r: any) => r.runId), [flood.report.runId, out.report.runId, before.report.runId], "every run is recorded, newest first");
});

test("screens: release report with objectives, live measurements, policy change review with follow-up; Arabic operator", async () => {
  // One fresh measured request so the live view reports a measurement rather than its absence.
  const pupil = fx.quiet.pupils[2];
  const fresh = await req(pupil.cookie, `${fx.exam}/attempt`, { method: "PATCH", body: { sequence: pupil.sequence + 1, responses: { q1: "a2", q3: "Synthetic screen check" }, submit: false } });
  assert.equal(fresh.status, 200); pupil.sequence = fresh.json.attempt.sequence;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await ctx.addCookies((await cookie("operator")).split("; ").map(kv => { const i = kv.indexOf("="); return { name: kv.slice(0, i), value: kv.slice(i + 1), url: base }; }));
  const page = await ctx.newPage();
  await page.goto(`${base}/owner`);
  await page.getByRole("button", { name: "Capacity" }).first().click();
  await page.locator("[data-capacity]").waitFor({ timeout: 60_000 });
  // SKO-492: passing and failing reports both stay inspectable, whatever their outcome. The newest run is the
  // tested flood limit, the second the run after the scoped limit.
  for (const n of [0, 1]) {
    const run = page.locator("[data-run]").nth(n);
    await run.locator("[data-run-toggle]").click();
    const row = page.locator('[data-run-detail] [data-objective="critical_fairness_ratio"]');
    await row.waitFor();
    assert.match(String(await row.getAttribute("data-pass")), /^(true|false|null)$/);
    assert.equal(await run.getAttribute("data-run-passed"), String((await page.locator("[data-run-detail] [data-objective]").evaluateAll(rows => rows.every(r => r.getAttribute("data-pass") === "true")))));
  }
  assert.match(await page.locator("[data-telemetry-state]").innerText(), /Measured/);
  await page.locator("[data-run-evidence]").click();
  await shot(page, "01-release-report");
  await page.locator("[data-policy-open]").click();
  await page.locator("[data-policy-school]").selectOption(fx.noisy.schoolId);
  await page.locator("[data-policy-scope]").selectOption("BACKGROUND_JOBS");
  await page.locator("[data-policy-limit]").fill("1");
  await page.locator("[data-policy-reason]").fill("Synthetic incident: report batch contention");
  await page.locator("[data-policy-expires]").fill(new Date(Date.now() + 7_200_000 + 5 * 3_600_000).toISOString().slice(0, 16));
  await shot(page, "02-policy-change-review");
  await page.locator("[data-policy-save]").click();
  await page.locator("[data-policy-result]").waitFor();
  assert.match(await page.locator("[data-policy-result]").innerText(), /A follow-up measurement is required/);
  await page.locator("[data-policy-close]").click();
  await page.locator("[data-follow-up]").waitFor();
  const active = page.locator("[data-active-policy]").filter({ hasText: "report batch contention" });
  await active.locator("[data-policy-revert]").click();
  await page.locator("[data-revert-reason]").fill("Synthetic incident closed");
  await page.locator("[data-revert-save]").click();
  await page.locator("[data-revert-form]").waitFor({ state: "detached" });
  await page.locator("[data-active-policy]").filter({ hasText: "report batch contention" }).waitFor({ state: "detached" });
  await shot(page, "03-after-revert-follow-up");
  await ctx.close();
  const ar = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await ar.addCookies((await cookie("operator-ar")).split("; ").map(kv => { const i = kv.indexOf("="); return { name: kv.slice(0, i), value: kv.slice(i + 1), url: base }; }));
  const arPage = await ar.newPage();
  await arPage.goto(`${base}/owner?view=capacity`);
  await arPage.locator("[data-capacity]").waitFor({ timeout: 60_000 }).catch(async e => { await shot(arPage, "00-debug-ar"); throw e; });
  assert.equal(await arPage.evaluate(() => document.documentElement.dir), "rtl");
  assert.match(await arPage.locator("[data-capacity] h2").innerText(), /السعة/);
  assert.equal(await arPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no horizontal page scroll on a phone");
  await shot(arPage, "04-operator-ar-phone");
  await ar.close();
});
