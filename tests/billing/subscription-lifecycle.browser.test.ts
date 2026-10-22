import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-373 on the isolated app with synthetic provider secrets and a local Stripe stand-in (no real
// provider is ever called): only the owner or an explicit delegate can touch the subscription; signed
// Stripe events are deduplicated, cannot be reversed by an older event, keep the paid-through date and
// park unknown institutions for review; SafePay replays never extend a plan twice and a missing amount
// is parked; cancellation is previewed and can be resumed; extra grace is a reviewed exception.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.BILLING_TEST_APP || "http://localhost:3108";
const evidence = process.env.BILLING_EVIDENCE_DIR || "/tmp/sko373-evidence";
const WEBHOOK_SECRET = "whsec_synthetic373", SAFEPAY_SECRET = "synthetic-safepay-373", STRIPE_PORT = 55442;
const db = new PrismaClient(), password = "SyntheticBilling373!";
const schoolId = `bill373-${randomUUID()}`, campusId = randomUUID(), manualSchoolId = `bill373m-${randomUUID()}`, manualCampusId = randomUUID();
const tag = randomUUID().slice(0, 8), subId = `sub_syn_${tag}`, cusId = `cus_syn_${tag}`;
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const secrets = new Map<string, string>();
const signer = new Stripe("sk_test_synthetic373");
let browser: Browser, fake: Server;
const now = () => Math.floor(Date.now() / 1000);
// What the stand-in Stripe API reports for each subscription.
const subscriptions = new Map<string, Record<string, unknown>>();
const subscription = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, object: "subscription", status, customer: id === subId ? cusId : `cus_none_${tag}`, cancel_at_period_end: false, cancel_at: null,
  metadata: id === subId ? { schoolId, plan: "PRO" } : {}, items: { object: "list", data: [{ id: `si_${id}`, current_period_end: now() + 30 * 86400, price: { id: "price_unknown_synthetic" } }] }, ...extra,
});

async function user(key: string, role: string, school: string, campus: string, extra: Record<string, unknown> = {}, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId: school, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language, ...extra } });
  users.set(key, { id, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    secrets.set(key, secret.replace(/\s+/g, ""));
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secrets.get(key)!) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  } else if (secrets.has(key)) {
    // Signing in again: answer the second-factor challenge. The synthetic user's last-used step
    // is reset so a code from the same 30-second window is not treated as a replay.
    await db.user.update({ where: { id: users.get(key)!.id }, data: { mfaLastStep: -1 } });
    assert.equal((await ctx.request.post(base + "/api/auth/mfa", { data: { action: "challenge", code: totp(secrets.get(key)!) } })).status(), 200, `mfa challenge ${key}`);
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
async function stripeEvent(id: string, type: string, created: number, object: Record<string, unknown>) {
  const payload = JSON.stringify({ id, object: "event", type, created, api_version: "2026-04-22.dahlia", data: { object } });
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const response = await fetch(`${base}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
  return { status: response.status, body: await response.json() };
}
async function safepay(body: Record<string, unknown>) {
  const signature = createHmac("sha256", SAFEPAY_SECRET).update(JSON.stringify(body)).digest("hex");
  const response = await fetch(`${base}/api/safepay/notification`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, signature }) });
  return { status: response.status, body: await response.json() };
}
const school = (id = schoolId) => db.school.findUniqueOrThrow({ where: { id }, select: { status: true, subscriptionLifecycleState: true, planEndsAt: true, graceEndsAt: true, cancellationEffectiveAt: true, plan: true } });
const lifecycle = async (key: string, body: Record<string, unknown>) => (await context(key)).request.post(`${base}/api/billing/lifecycle`, { data: { idempotencyKey: randomUUID(), ...body } });
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  fake = createServer((req, res) => {
    let raw = ""; req.on("data", chunk => { raw += chunk; }); req.on("end", () => {
      const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
      const match = req.url?.match(/^\/v1\/subscriptions\/([^/?]+)/);
      if (match && subscriptions.has(match[1])) {
        const current = subscriptions.get(match[1])!;
        if (req.method === "POST") {
          const form = new URLSearchParams(raw);
          if (form.has("cancel_at_period_end")) { const on = form.get("cancel_at_period_end") === "true"; current.cancel_at_period_end = on; current.cancel_at = on ? now() + 30 * 86400 : null; }
        }
        return send(200, current);
      }
      if (req.url?.startsWith("/v1/billing_portal/sessions")) return send(200, { id: "bps_synthetic", object: "billing_portal.session", url: "https://billing.example.invalid/session" });
      send(404, { error: { message: `stand-in has no ${req.method} ${req.url}` } });
    });
  });
  await new Promise<void>(resolve => fake.listen(STRIPE_PORT, "127.0.0.1", resolve));
  subscriptions.set(subId, subscription(subId, "active"));
  const lapsed = new Date(Date.now() - 40 * 86400_000);
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Group", registrationKind: "GROUP", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", subscriptionLifecycleState: "ACTIVE", stripeSubscriptionId: subId, stripeCustomerId: cusId, planEndsAt: lapsed } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar North", regId: campusId, city: "Lahore" } });
  await db.school.create({ data: { id: manualSchoolId, name: "Synthetic Willow School", registrationKind: "STANDALONE", slug: manualSchoolId, regId: manualSchoolId, contactEmail: `${manualSchoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "BASIC", subscriptionLifecycleState: "ACTIVE", planEndsAt: new Date(Date.now() + 10 * 86400_000) } });
  await db.campus.create({ data: { id: manualCampusId, schoolId: manualSchoolId, name: "Willow Main", regId: manualCampusId, city: "Karachi" } });
  // role-ux §7.2 G6: the subscription belongs to the institution authority — the group admin of a school group
  // (owner, or another group admin with a purchase delegation) and the school admin of a single school.
  await user("owner", "SUPER_ADMIN", schoolId, campusId, { isInstitutionOwner: true });
  await user("owner-ar", "SUPER_ADMIN", schoolId, campusId, { canPurchaseSubscription: true }, "ar");
  await user("campus-admin", "CAMPUS_ADMIN", schoolId, campusId);
  await user("accountant", "ACCOUNTANT", schoolId, campusId);
  await user("manual-owner", "ADMIN", manualSchoolId, manualCampusId, { isInstitutionOwner: true });
  await user("platform", "APP_OWNER", schoolId, campusId);
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await new Promise(resolve => fake?.close(resolve));
  await db.stripeWebhookReceipt.deleteMany({ where: { OR: [{ eventId: { contains: tag } }, { schoolId: { in: [schoolId, manualSchoolId] } }] } });
  for (const id of [schoolId, manualSchoolId]) await db.school.delete({ where: { id } }).catch(() => undefined);
  await db.$disconnect();
});

test("only the institution owner or an explicit delegate can change the subscription", async () => {
  const admin = await context("campus-admin");
  for (const [path, body] of [["/api/billing/lifecycle", { action: "preview", plan: "BASIC", idempotencyKey: randomUUID() }], ["/api/stripe/portal", {}], ["/api/stripe/checkout", { plan: "BASIC" }], ["/api/billing/payment-request", { plan: "BASIC", billingPeriod: "monthly", idempotencyKey: randomUUID() }]] as const) {
    assert.equal((await admin.request.post(base + path, { data: body })).status(), 403, `${path} is refused without delegation`);
  }
  const view = await (await admin.request.get(`${base}/api/billing/lifecycle`)).json();
  assert.equal(view.canManage, false);
  // role-ux G9: staff see who manages the subscription by name only, never an email.
  assert.equal(view.managedBy, "Synthetic owner", "non-payers see who to contact");
  assert.equal("billingContact" in view, false, "no contact email reaches non-payers");
  assert.equal((await (await context("accountant")).request.post(`${base}/api/billing/lifecycle`, { data: { action: "cancel-preview", idempotencyKey: randomUUID() } })).status(), 403, "tuition finance is not subscription authority");
  assert.equal((await lifecycle("owner-ar", { action: "preview", plan: "BASIC" })).status(), 200, "an explicit delegate may preview");
  const portal = await (await context("owner")).request.post(`${base}/api/stripe/portal`, { data: {} });
  assert.equal(portal.status(), 200, await portal.text());
  await (await context("owner")).request.post(`${base}/api/stripe/portal`, { data: {} });
  assert.equal(await db.subscriptionRequest.count({ where: { schoolId, kind: "RENEWAL_RECOVERY" } }), 1, "opening the portal twice records one recovery request");
});

test("Stripe events are deduplicated, ordered, keep the paid-through date and park unknown institutions", async () => {
  const t = now();
  assert.equal((await stripeEvent(`evt_${tag}_1`, "customer.subscription.updated", t, { id: subId, object: "subscription" })).status, 200);
  let state = await school();
  assert.equal(state.subscriptionLifecycleState, "ACTIVE");
  assert.ok(state.planEndsAt! > new Date(Date.now() + 25 * 86400_000), "the renewal Stripe took moves the paid-through date forward");
  const cron = await fetch(`${base}/api/cron/subscription-expiry`, { method: "POST" });
  assert.equal(cron.status, 200);
  assert.equal((await school()).status, "ACTIVE", "the expiry sweep never suspends a Stripe-managed school");

  subscriptions.set(subId, subscription(subId, "past_due"));
  assert.equal((await stripeEvent(`evt_${tag}_2`, "invoice.payment_failed", t + 10, { id: `in_${tag}`, object: "invoice", customer: cusId, parent: { subscription_details: { subscription: subId } } })).status, 200);
  state = await school();
  assert.deepEqual([state.subscriptionLifecycleState, state.status], ["PAST_DUE_GRACE", "ACTIVE"]);
  assert.ok(state.graceEndsAt);

  subscriptions.set(subId, subscription(subId, "active"));
  assert.equal((await stripeEvent(`evt_${tag}_3`, "invoice.payment_succeeded", t + 20, { id: `in_${tag}b`, object: "invoice", customer: cusId, parent: { subscription_details: { subscription: subId } } })).status, 200);
  assert.deepEqual([(await school()).subscriptionLifecycleState, (await school()).graceEndsAt], ["ACTIVE", null]);

  subscriptions.set(subId, subscription(subId, "past_due"));
  const replay = await stripeEvent(`evt_${tag}_2`, "invoice.payment_failed", t + 10, { id: `in_${tag}`, object: "invoice", customer: cusId, parent: { subscription_details: { subscription: subId } } });
  assert.equal(replay.body.duplicate, true, "a replayed event is a no-op");
  await stripeEvent(`evt_${tag}_4`, "invoice.payment_failed", t + 5, { id: `in_${tag}c`, object: "invoice", customer: cusId, parent: { subscription_details: { subscription: subId } } });
  assert.equal((await school()).subscriptionLifecycleState, "ACTIVE", "an older failure cannot reverse a newer confirmed payment");
  subscriptions.set(subId, subscription(subId, "active"));

  const unknown = `sub_unknown_${tag}`;
  subscriptions.set(unknown, subscription(unknown, "active"));
  const parked = await stripeEvent(`evt_${tag}_5`, "customer.subscription.updated", t + 30, { id: unknown, object: "subscription" });
  assert.deepEqual([parked.status, parked.body.review], [200, true]);
  assert.equal((await db.stripeWebhookReceipt.findUniqueOrThrow({ where: { eventId: `evt_${tag}_5` } })).state, "NEEDS_REVIEW");
});

test("SafePay replays never extend a plan twice; a missing amount is parked for review", async () => {
  const before = (await school(manualSchoolId)).planEndsAt!;
  const order = (ref: string, amount?: number) => ({ event: "order.completed", data: { order_ref: ref, ...(amount === undefined ? {} : { amount }), metadata: { schoolId: manualSchoolId, plan: "BASIC", billingPeriod: "monthly" } } });
  const price = (await (await (await context("manual-owner")).request.get(`${base}/api/billing`)).json()).billing.plans.BASIC.price as number;
  const first = await safepay(order(`SYN-${tag}-1`, price));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const extended = (await school(manualSchoolId)).planEndsAt!;
  assert.equal(Math.round((extended.getTime() - before.getTime()) / 86400_000), 30);
  const again = await safepay(order(`SYN-${tag}-1`, price));
  assert.equal(again.body.duplicate, true);
  assert.equal((await school(manualSchoolId)).planEndsAt!.getTime(), extended.getTime(), "a replay never extends the paid-through date again");
  const missing = await safepay(order(`SYN-${tag}-2`));
  assert.equal(missing.body.review, true);
  assert.equal((await school(manualSchoolId)).planEndsAt!.getTime(), extended.getTime(), "no amount, no activation");

  const platform = await context("platform");
  const queue = (await (await platform.request.get(`${base}/api/owner/provider-events`)).json()).events as { eventId: string; state: string }[];
  for (const id of [`evt_${tag}_5`, `safepay:order.completed:SYN-${tag}-2`]) assert.ok(queue.some(e => e.eventId === id && e.state === "NEEDS_REVIEW"), `${id} waits for an operator`);
  assert.equal((await platform.request.post(`${base}/api/owner/provider-events`, { data: { eventId: `safepay:order.completed:SYN-${tag}-2`, note: "ok" } })).status(), 400);
  assert.equal((await platform.request.post(`${base}/api/owner/provider-events`, { data: { eventId: `safepay:order.completed:SYN-${tag}-2`, note: "Bank confirmed no payment was taken; family billing contact informed." } })).status(), 200);
  assert.ok(await db.auditLog.findFirst({ where: { schoolId: manualSchoolId, tableName: "billing_provider_event" } }));
  assert.equal((await safepay(order(`SYN-${tag}-2`, price))).body.duplicate, true, "a resolved event is never applied later");
});

test("cancellation is previewed, scheduled with the provider and can be resumed; without a provider it is reviewed", async () => {
  const preview = (await (await lifecycle("owner", { action: "cancel-preview" })).json()).preview;
  assert.ok(preview.effectiveAt);
  assert.ok(preview.consequences.includes("All institution records are kept; nothing is deleted when the subscription ends."));
  const cancelled = await lifecycle("owner", { action: "cancel", reason: "Moving to annual billing next term" });
  assert.equal(cancelled.status(), 202, await cancelled.text());
  assert.equal((await cancelled.json()).providerConfirmed, true);
  assert.equal((await school()).subscriptionLifecycleState, "CANCELLATION_SCHEDULED");
  assert.equal(subscriptions.get(subId)!.cancel_at_period_end, true);
  assert.equal((await lifecycle("owner", { action: "resume" })).status(), 200);
  assert.deepEqual([(await school()).subscriptionLifecycleState, subscriptions.get(subId)!.cancel_at_period_end], ["ACTIVE", false]);
  assert.equal((await lifecycle("owner", { action: "resume" })).status(), 409, "nothing to resume twice");

  const manual = await lifecycle("manual-owner", { action: "cancel", reason: "Closing the evening campus" });
  assert.equal((await manual.json()).request.state, "PENDING_REVIEW");
  const request = await db.subscriptionRequest.findFirstOrThrow({ where: { schoolId: manualSchoolId, kind: "CANCELLATION" } });
  const platform = await context("platform");
  assert.equal((await platform.request.post(`${base}/api/owner/subscription-requests`, { data: { requestId: request.id, decision: "APPROVE_REQUEST", reason: "" } })).status(), 400, "a review needs a reason");
  assert.equal((await platform.request.post(`${base}/api/owner/subscription-requests`, { data: { requestId: request.id, decision: "APPROVE_REQUEST", reason: "Confirmed with the institution owner by phone" } })).status(), 200);
  assert.equal((await school(manualSchoolId)).subscriptionLifecycleState, "CANCELLATION_SCHEDULED");
  assert.equal((await lifecycle("manual-owner", { action: "resume" })).status(), 200);
  assert.equal((await db.subscriptionRequest.findUniqueOrThrow({ where: { id: request.id } })).state, "WITHDRAWN");
});

test("extra grace is a reviewed exception that restores access until the approved date", async () => {
  await db.school.update({ where: { id: manualSchoolId }, data: { status: "SUSPENDED", subscriptionLifecycleState: "PAST_DUE", graceEndsAt: null } });
  sessions.delete("manual-owner");
  const owner = await context("manual-owner");
  const page = await owner.newPage();
  // G10/G43: old links resolve through /billing to the payer's own Billing & plan, reachable while suspended.
  await page.goto(`${base}/subscription`);
  await page.waitForURL((target) => target.pathname === "/admin" && target.searchParams.get("view") === "billing");
  assert.equal(new URL(page.url()).searchParams.get("view"), "billing", "the standalone payer can still reach recovery while suspended");
  await page.close();
  assert.equal((await owner.request.get(`${base}/api/classes`)).status(), 402);
  assert.equal((await lifecycle("manual-owner", { action: "grace", reason: "short", graceUntil: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10) })).status(), 400);
  assert.equal((await lifecycle("manual-owner", { action: "grace", reason: "Bank transfer is processing after the holiday", graceUntil: new Date(Date.now() + 45 * 86400_000).toISOString().slice(0, 10) })).status(), 400, "no more than 30 days");
  const until = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  assert.equal((await lifecycle("manual-owner", { action: "grace", reason: "Bank transfer is processing after the holiday", graceUntil: until })).status(), 202);
  assert.equal((await school(manualSchoolId)).status, "SUSPENDED", "a request alone changes nothing");
  const request = await db.subscriptionRequest.findFirstOrThrow({ where: { schoolId: manualSchoolId, kind: "GRACE_EXTENSION" } });
  assert.equal((await (await context("platform")).request.post(`${base}/api/owner/subscription-requests`, { data: { requestId: request.id, decision: "APPROVE_REQUEST", reason: "Transfer reference checked with the bank" } })).status(), 200);
  const granted = await school(manualSchoolId);
  assert.deepEqual([granted.status, granted.subscriptionLifecycleState, granted.graceEndsAt!.toISOString().slice(0, 10)], ["ACTIVE", "APPROVED_GRACE", until]);
  assert.ok(await db.auditLog.findFirst({ where: { schoolId: manualSchoolId, tableName: "subscription_request", recordId: request.id } }));
  sessions.delete("manual-owner");
  assert.equal((await (await context("manual-owner")).request.get(`${base}/api/classes`)).status(), 200, "access is restored during approved grace");
  await db.school.update({ where: { id: manualSchoolId }, data: { graceEndsAt: new Date(Date.now() - 60_000) } });
  sessions.delete("manual-owner");
  assert.equal((await (await context("manual-owner")).request.get(`${base}/api/classes`)).status(), 402, "approved grace ends like any grace");
  assert.equal((await school(manualSchoolId)).subscriptionLifecycleState, "PAST_DUE");
});

test("the payer sees plain-language state and a cancellation preview, in English and Arabic", async () => {
  const page = await (await context("owner")).newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  // §6.2: /billing is the one return address; the group payer lands on the group console's Billing & plan.
  await page.goto(`${base}/billing`);
  await page.waitForURL((target) => target.pathname === "/super" && target.searchParams.get("view") === "billing");
  const panel = page.locator("[data-subscription-lifecycle]");
  await panel.waitFor({ timeout: 30_000 });
  assert.match(await panel.locator("[data-state-explainer]").innerText(), /The subscription is paid and renews on the renewal date/);
  await panel.getByRole("button", { name: "Cancel subscription…" }).click();
  await panel.locator("[data-cancel-preview]").waitFor({ timeout: 15_000 });
  assert.match(await panel.locator("[data-cancel-preview]").innerText(), /nothing is deleted when the subscription ends/);
  await panel.locator("[data-cancel-preview]").scrollIntoViewIfNeeded();
  await shot(page, "billing-cancel-preview-en-1440");
  await panel.getByRole("button", { name: "Keep subscription" }).click();
  assert.equal(await panel.locator("[data-cancel-preview]").count(), 0);
  assert.deepEqual(errors, []);
  await page.close();

  const ar = await (await context("owner-ar", { width: 390, height: 844 })).newPage();
  await ar.goto(`${base}/subscription`);
  await ar.waitForURL((target) => target.pathname === "/super" && target.searchParams.get("view") === "billing");
  await ar.locator("[data-subscription-lifecycle]").waitFor({ timeout: 30_000 });
  assert.equal(await ar.evaluate("document.documentElement.dir"), "rtl");
  assert.match(await ar.locator("[data-state-explainer]").innerText(), /الاشتراك مدفوع/);
  assert.equal(await ar.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await shot(ar, "billing-lifecycle-ar-390");
  await ar.close();
});
