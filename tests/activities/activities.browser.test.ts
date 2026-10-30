import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-440 on the isolated app with synthetic data: eligibility and schedule clashes are explained before a
// booking; the last place goes to one family and the next joins the waitlist; a freed place makes an
// expiring offer; a trip place stays conditional until trip consent and the fee are done, and a material
// trip change makes it conditional again; cancelling a paid place releases capacity once and hands one
// refund request to finance; attendance is only for confirmed participants.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.ACTIVITIES_TEST_APP || "http://localhost:3107";
const evidence = process.env.ACTIVITIES_EVIDENCE_DIR || "/tmp/sko440-evidence";
const db = new PrismaClient(), password = "SyntheticActs440!";
const schoolId = `act440-${randomUUID()}`, campusId = randomUUID(), classA = randomUUID(), classB = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
const DAY = 86_400_000, hour = (h: number) => new Date(Math.floor(Date.now() / DAY) * DAY + 3 * DAY + h * 3_600_000);

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
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const body = await r.text(); await ctx.close(); let json: { data?: any; error?: string } = {}; try { json = JSON.parse(body); } catch { /* */ } return { status: r.status(), json, body }; };
const id = (key: string) => users.get(key)!.id;
const relate = async (studentId: string, guardianKey: string) => {
  const rel = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: id(guardianKey), createdByUserId: id("coordinator"), fullName: `Synthetic ${guardianKey}`, email: users.get(guardianKey)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: id("coordinator"), reason: "Synthetic activities fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false, consents: { fieldTrips: true, offsiteTravel: false, medicalTreatment: false, mediaPublication: false } } } });
};
const place = async (activityId: string, studentKey: string) => db.activityPlace.findUnique({ where: { activityId_studentId: { activityId, studentId: ids[studentKey] } } });
const fam = (key: string, body: Record<string, unknown>) => call(key, "post", "/api/family/activities", body);
const coord = (body: Record<string, unknown>) => call("coordinator", "post", "/api/activities", body);

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Poplar School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Poplar Main", regId: campusId, city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await user("coordinator", "CAMPUS_ADMIN"); await user("teacher", "TEACHER");
  await user("noorParent", "PARENT"); await user("bilalParent", "PARENT"); await user("zainParent", "PARENT"); await user("parent-ar", "PARENT", "ar");
  await db.class.create({ data: { id: classA, schoolId, campusId, name: "Grade 6", section: "A", academicYear: 2026 } });
  await db.class.create({ data: { id: classB, schoolId, campusId, name: "Grade 7", section: "B", academicYear: 2026 } });
  for (const [key, name, klass] of [["noor", "Synthetic Noor Khan", classA], ["bilal", "Synthetic Bilal Aziz", classA], ["zain", "Synthetic Zain Ali", classB]] as const) { ids[key] = randomUUID(); await db.student.create({ data: { id: ids[key], schoolId, campusId, classId: klass, fullName: name, rollNo: key, gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never }); }
  await relate(ids.noor, "noorParent"); await relate(ids.bilal, "bilalParent"); await relate(ids.zain, "zainParent"); await relate(ids.noor, "parent-ar");
  // The SKO-421 trip consent record the trip activity depends on (v1).
  const trip = await db.trip.create({ data: { schoolId, campusId, createdById: id("coordinator") } });
  ids.trip = trip.id;
  await db.tripVersion.create({ data: { schoolId, tripId: trip.id, version: 1, title: "Synthetic science museum", destination: "Synthetic museum", departAt: hour(10.5), returnAt: hour(14), respondBy: hour(-2), costAmount: 4500, costCurrency: "PKR", contact: "Office", instructions: "Bring lunch.", consentKind: "fieldTrips", signatoryRule: "ANY_GUARDIAN", publishedById: id("coordinator") } });
  // A paid invoice and payment per child, for the refund handoff.
  for (const key of ["noor", "bilal"]) {
    ids[`invoice_${key}`] = (await db.invoice.create({ data: { schoolId, campusId, studentId: ids[key], invoiceDate: new Date(), dueDate: new Date(Date.now() + 7 * DAY), currency: "PKR", invoiceNumber: `SYN-440-${randomUUID().slice(0, 8)}`, monthlyFee: 0, oneTimeFees: 4500, subtotal: 4500, totalAmount: 4500, totalAmountPaid: 4500, balanceDue: 0, status: "PAID" } as never })).id;
    const payment = await db.payment.create({ data: { schoolId, campusId, studentId: ids[key], invoiceId: ids[`invoice_${key}`], currency: "PKR", amount: 4500, paymentDate: new Date(), paymentMethod: "CASH", receiptNo: `SYN-440-${randomUUID().slice(0, 8)}` } });
    ids[`payment_${key}`] = payment.id;
    await db.paymentAllocation.create({ data: { schoolId, campusId, paymentId: payment.id, invoiceId: ids[`invoice_${key}`], amount: 4500, currency: "PKR" } });
  }
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("activities state their rules up front; a trip must rely on its consent record", async () => {
  const common = { location: "Room 9", startsAt: hour(10).toISOString(), endsAt: hour(11).toISOString(), cancellationTerms: "Withdraw up to a day before for a full refund." };
  assert.equal((await coord({ action: "create", kind: "TRIP", title: "Trip without consent", capacity: 5, ...common })).status, 400);
  assert.equal((await coord({ action: "create", kind: "CLUB", title: "No terms", capacity: 5, ...common, cancellationTerms: "" })).status, 400);
  const chess = await coord({ action: "create", kind: "CLUB", title: "Synthetic chess club", capacity: 1, classIds: [classA], ...common });
  assert.equal(chess.status, 201, JSON.stringify(chess.json)); ids.chess = chess.json.data.id;
  const visit = await coord({ action: "create", kind: "TRIP", title: "Synthetic science visit", capacity: 2, costAmount: 4500, classIds: [classA], tripId: ids.trip, location: "Synthetic museum", startsAt: hour(10.5).toISOString(), endsAt: hour(14).toISOString(), cancellationTerms: "Full refund if withdrawn 24 hours before departure." });
  assert.equal(visit.status, 201, JSON.stringify(visit.json)); ids.visit = visit.json.data.id;
  assert.equal((await call("teacher", "get", `/api/activities?id=${ids.chess}`)).status, 404, "only the activity's staff see its roster");
  const zainView = (await call("zainParent", "get", `/api/family/activities?studentId=${ids.zain}`)).json.data;
  assert.equal(zainView.activities.find((a: { id: string }) => a.id === ids.chess).blocker, "This activity is not open to this learner's class.", "explained before booking");
  assert.equal((await fam("zainParent", { action: "request", activityId: ids.chess, studentId: ids.zain })).status, 409);
});

test("the last place goes to one family; the next joins the waitlist; a freed place makes an expiring offer", async () => {
  const [a, b] = await Promise.all([fam("noorParent", { action: "request", activityId: ids.chess, studentId: ids.noor }), fam("bilalParent", { action: "request", activityId: ids.chess, studentId: ids.bilal })]);
  assert.deepEqual([a.json.data.status, b.json.data.status].sort(), ["CONFIRMED", "WAITLIST"], JSON.stringify([a.json, b.json]));
  const noorFirst = a.json.data.status === "CONFIRMED";
  const [winner, loser] = noorFirst ? ["noor", "bilal"] : ["bilal", "noor"];
  assert.equal((await fam(`${winner}Parent`, { action: "request", activityId: ids.chess, studentId: ids[winner] })).json.data.repeated, true, "a retried request keeps one place");
  assert.equal(await db.activityPlace.count({ where: { activityId: ids.chess, status: { in: ["OFFERED", "RESERVED", "CONFIRMED"] } } }), 1);
  // The winner withdraws: the waitlisted learner gets an expiring offer.
  const winnerPlace = (await place(ids.chess, winner))!;
  assert.equal((await fam(`${winner}Parent`, { action: "withdraw", placeId: winnerPlace.id })).status, 200);
  let offered = (await place(ids.chess, loser))!;
  assert.equal(offered.status, "OFFERED");
  assert.ok(offered.offerExpiresAt && offered.offerExpiresAt > new Date());
  assert.equal(await db.notification.count({ where: { userId: id(`${loser}Parent`), type: "ACTIVITY_PLACE_OFFERED" } }), 1);
  // The offer lapses before an answer.
  await db.activityPlace.update({ where: { id: offered.id }, data: { offerExpiresAt: new Date(Date.now() - 1000) } });
  const late = await fam(`${loser}Parent`, { action: "answer", placeId: offered.id, knownVersion: offered.version, accept: true });
  assert.equal(late.status, 409); assert.match(late.json.error!, /expired/);
  assert.equal((await place(ids.chess, loser))!.status, "EXPIRED");
  // Asking again takes the free place.
  assert.equal((await fam(`${loser}Parent`, { action: "request", activityId: ids.chess, studentId: ids[loser] })).json.data.status, "CONFIRMED");
  ids.chessHolder = loser;
  // The other learner rejoins at the back of the waitlist and gets the next offer.
  assert.equal((await fam(`${winner}Parent`, { action: "request", activityId: ids.chess, studentId: ids[winner] })).json.data.status, "WAITLIST");
  offered = (await place(ids.chess, winner))!;
  assert.equal(offered.status, "WAITLIST");
});

test("a trip place is conditional until consent and fee; a schedule clash is explained; a material change re-opens consent", async () => {
  const clash = await fam(`${ids.chessHolder}Parent`, { action: "request", activityId: ids.visit, studentId: ids[ids.chessHolder] });
  assert.equal(clash.status, 409); assert.equal(clash.json.error, "This overlaps with another of this learner's activities.");
  // The other child's chess place is waitlisted, so they are free for the visit.
  const K = ids.chessHolder === "noor" ? "bilal" : "noor"; ids.tripKid = K;
  const req = await fam(`${K}Parent`, { action: "request", activityId: ids.visit, studentId: ids[K] });
  assert.equal(req.json.data.status, "RESERVED", "conditional, not confirmed");
  let view = (await call(`${K}Parent`, "get", `/api/family/activities?studentId=${ids[K]}`)).json.data.activities.find((a: { id: string }) => a.id === ids.visit);
  assert.deepEqual(view.place.requirements, { consent: "PENDING", fee: "DUE" });
  assert.equal(await db.tripInvitee.count({ where: { tripId: ids.trip, studentId: ids[K] } }), 1, "the family receives the trip consent request");
  assert.equal((await call(`${K}Parent`, "post", "/api/family/trips", { tripId: ids.trip, studentId: ids[K], version: 1, choice: "GRANTED", idempotencyKey: `k-${randomUUID()}` })).status, 201);
  assert.equal((await place(ids.visit, K))!.status, "RESERVED");
  view = (await call(`${K}Parent`, "get", `/api/family/activities?studentId=${ids[K]}`)).json.data.activities.find((a: { id: string }) => a.id === ids.visit);
  assert.deepEqual([view.place.status, view.place.requirements.consent, view.place.requirements.fee], ["RESERVED", "GRANTED", "DUE"], "the fee is still missing");
  const p = (await place(ids.visit, K))!;
  assert.equal((await coord({ action: "fee", placeId: p.id, feeStatus: "PAID", invoiceId: ids[`invoice_${K}`], paymentId: ids[`payment_${K}`] })).status, 200);
  assert.equal((await place(ids.visit, K))!.status, "CONFIRMED");
  // The school changes the return time: a material change needs fresh consent.
  await db.tripVersion.create({ data: { schoolId, tripId: ids.trip, version: 2, title: "Synthetic science museum", destination: "Synthetic museum", departAt: hour(10.5), returnAt: hour(16), respondBy: hour(-2), costAmount: 4500, costCurrency: "PKR", contact: "Office", instructions: "Bring lunch.", consentKind: "fieldTrips", signatoryRule: "ANY_GUARDIAN", material: true, changeNote: "Return moved to 16:00", publishedById: id("coordinator") } });
  await db.trip.update({ where: { id: ids.trip }, data: { currentVersion: 2 } });
  const roster = (await call("coordinator", "get", `/api/activities?id=${ids.visit}`)).json.data;
  const row = roster.places.find((r: { studentId: string }) => r.studentId === ids[K]);
  assert.deepEqual([row.status, row.requirements.consent], ["RESERVED", "PENDING"], "only the affected consent is invalidated");
  assert.ok(!JSON.stringify(roster).toLowerCase().includes("medical"), "no care detail on the roster");
  assert.equal((await call(`${K}Parent`, "post", "/api/family/trips", { tripId: ids.trip, studentId: ids[K], version: 2, choice: "GRANTED", idempotencyKey: `k-${randomUUID()}` })).status, 201);
  assert.equal((await call("coordinator", "get", `/api/activities?id=${ids.visit}`)).json.data.places.find((r: { studentId: string }) => r.studentId === ids[K]).status, "CONFIRMED");
});

test("cancelling a paid place releases capacity once and hands one refund request to finance", async () => {
  const K = ids.tripKid;
  const p = (await place(ids.visit, K))!;
  assert.equal((await fam(`${K}Parent`, { action: "withdraw", placeId: p.id })).status, 200);
  assert.equal((await fam(`${K}Parent`, { action: "withdraw", placeId: p.id })).json.data.status, "CANCELLED", "a retry changes nothing");
  const cancelled = (await place(ids.visit, K))!;
  assert.deepEqual([cancelled.status, cancelled.refundState], ["CANCELLED", "NEEDED"]);
  assert.equal((await call(`${K}Parent`, "get", `/api/family/activities?studentId=${ids[K]}`)).json.data.activities.find((a: { id: string }) => a.id === ids.visit).placesLeft, 2, "capacity released");
  assert.equal((await call("teacher", "post", "/api/activities", { action: "refund", placeId: p.id })).status, 403);
  const r1 = await coord({ action: "refund", placeId: p.id }), r2 = await coord({ action: "refund", placeId: p.id });
  assert.equal(r1.status, 200, JSON.stringify(r1.json));
  assert.equal(r1.json.data.adjustmentId, r2.json.data.adjustmentId);
  assert.equal(await db.financialAdjustment.count({ where: { schoolId, invoiceId: ids[`invoice_${K}`], kind: "REFUND" } }), 1, "one refund request, no money issued twice");
  assert.equal((await db.financialAdjustment.findFirstOrThrow({ where: { schoolId, invoiceId: ids[`invoice_${K}`] } })).status, "REQUESTED", "finance still reviews it");
});

test("attendance is only for confirmed participants", async () => {
  const s = await coord({ action: "session", activityId: ids.chess, startsAt: hour(10).toISOString(), endsAt: hour(11).toISOString() });
  assert.equal(s.status, 201);
  assert.equal((await coord({ action: "attend", sessionId: s.json.data.id, studentId: ids[ids.chessHolder], status: "PRESENT" })).status, 200);
  assert.equal((await coord({ action: "attend", sessionId: s.json.data.id, studentId: ids[ids.tripKid], status: "PRESENT" })).status, 409, "a waitlisted learner is not marked");
});

test("screens: family activities (EN, phone), review with terms, coordinator roster, Arabic", async () => {
  const page = await (await context(`${ids.tripKid}Parent`)).newPage();
  await page.goto(`${base}/parent/attendance`);
  await page.locator(`[data-activity="${ids.visit}"] [data-activity-request]`).click();
  await page.locator("[data-activity-review]").waitFor();
  assert.ok((await page.locator("[data-activity-review]").innerText()).includes("Full refund if withdrawn"));
  await shot(page, "01-family-review-terms-en");
  await page.close();
  const phone = await (await context("bilalParent", { width: 390, height: 844 })).newPage();
  await phone.goto(`${base}/parent/attendance`);
  await phone.locator("[data-family-activities]").waitFor();
  await phone.locator("[data-family-activities]").scrollIntoViewIfNeeded();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no sideways scroll at phone width");
  await shot(phone, "02-family-phone");
  await phone.close();
  const c = await (await context("coordinator")).newPage();
  await c.goto(`${base}/activities`);
  await c.locator(`[data-activity-row="${ids.visit}"]`).click();
  await c.locator(`[data-activity-roster="${ids.visit}"]`).waitFor();
  await shot(c, "03-coordinator-roster-refund");
  await c.close();
  const ar = await (await context("parent-ar")).newPage();
  await ar.goto(`${base}/parent/attendance`);
  await ar.locator("[data-family-activities]").waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await ar.locator("[data-family-activities]").scrollIntoViewIfNeeded();
  await shot(ar, "04-family-ar");
  await ar.close();
});
