import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { calculate } from "../../src/lib/tax/packages";

// SKO-444 on the isolated app with synthetic data: Riyadh (SA), Lahore (PK) and Kuwait (KW, no package). Activation
// needs owner, identity, evidence, a passing fixture run on the exact configuration and a second approver; issued
// invoices carry an immutable tax document; a later version applies only from its date; sandbox submission
// distinguishes queued, accepted, rejected and corrected, and retries and corrections keep one document identity.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.TAX_TEST_APP || "http://localhost:3107";
const evidence = process.env.TAX_EVIDENCE_DIR || "/tmp/sko444-evidence";
const db = new PrismaClient(), password = "SyntheticTax444!";
const schoolId = `tax444-${randomUUID()}`, riyadh = randomUUID(), lahore = randomUUID(), toronto = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
const FIXTURES = [
  { name: "Tuition exempt, transport standard-rated", lines: [{ code: "TUITION", amount: 100000 }, { code: "TRANSPORT", amount: 20000 }], discount: 0, expected: { tax: 3000, total: 123000 } },
  { name: "Mixed lines with a discount and half-up rounding", lines: [{ code: "TUITION", amount: 50000 }, { code: "TRANSPORT", amount: 333 }, { code: "BOOKS", amount: 667 }], discount: 100, expected: { tax: 150, total: 51050 } },
];

async function user(key: string, role: string, campus = riyadh, language = "en") {
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
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const body = await r.text(); await ctx.close(); let json: { data?: any; error?: string } & Record<string, any> = {}; try { json = JSON.parse(body); } catch { /* */ } return { status: r.status(), json, body }; };
const tax = (key: string, data: Record<string, unknown>) => call(key, "post", "/api/tax", data);
const id = (key: string) => users.get(key)!.id;
const generate = (campusId: string, month: string) => call("finance1", "post", "/api/fees/generate-invoices", { campusId, generationMonth: month, includeLateFees: false });
const activation = (extra: Record<string, unknown>) => ({ action: "draft", packageCode: "SA-DEMO", packageVersion: 1, campusIds: [riyadh], legalName: "Synthetic Crescent Schools Co.", taxId: "123", exemptFeeCodes: ["TUITION"], ...extra });

async function campus(cid: string, name: string, country: string, currency: string, students: string[]) {
  await db.campus.create({ data: { id: cid, schoolId, name, regId: cid, city: name } });
  await db.academicCycle.create({ data: { schoolId, campusId: cid, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.localePolicy.create({ data: { schoolId, campusId: cid, scopeKey: cid, settings: { country, currency }, effectiveAt: new Date("2026-01-01Z"), createdBy: "synthetic" } });
  const classId = randomUUID();
  await db.class.create({ data: { id: classId, schoolId, campusId: cid, name: "Grade 5", section: "A", academicYear: 2026 } });
  for (const [i, s] of students.entries()) await db.student.create({ data: { id: randomUUID(), schoolId, campusId: cid, classId, fullName: s, rollNo: String(i + 1), gender: "OTHER", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never });
  const group = await db.feeGroup.create({ data: { schoolId, campusId: cid, name: `${name} fees`, currency } });
  for (const [code, amount] of [["TUITION", 100000], ["TRANSPORT", 20000]] as const) {
    const type = await db.feeType.create({ data: { schoolId, campusId: cid, name: code === "TUITION" ? "Tuition" : "Transport", code } });
    await db.feesMasterLine.create({ data: { schoolId, campusId: cid, feeGroupId: group.id, feeTypeId: type.id, amount } });
  }
  await db.feeGroupAssignment.create({ data: { schoolId, campusId: cid, classId, feeGroupId: group.id, academicYear: 2026 } });
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Crescent Schools", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO", timezone: "Asia/Riyadh" } as never });
  await campus(riyadh, "Crescent Riyadh", "SA", "SAR", ["Synthetic Layla Al-Harbi", "SYNTHETIC-REJECT Omar", "SYNTHETIC-TIMEOUT Sara"]);
  await campus(lahore, "Crescent Lahore", "PK", "PKR", ["Synthetic Ali Raza"]);
  await campus(toronto, "Crescent Kuwait", "KW", "KWD", ["Synthetic Maya Al-Sabah"]);
  // role-ux G27: the tax identity spans campuses, so sign-off is the institution authority's (a second group admin
  // here); finance1 drafts across campuses as the group admin (server break-glass), and the accountant never signs off.
  await user("finance1", "SUPER_ADMIN"); await user("finance2", "SUPER_ADMIN"); await user("teacher", "TEACHER"); await user("finance-ar", "ACCOUNTANT", riyadh, "ar");
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("the calculator matches accountant-approved fixtures: exemptions, discount spread and half-up rounding", () => {
  const v1 = { standardRatePercent: 15, rounding: "LINE_HALF_UP" as const }, v2 = { standardRatePercent: 15, rounding: "TOTAL_HALF_UP" as const };
  for (const f of FIXTURES) { const r = calculate(v1, f.lines.map(l => ({ ...l, name: l.code })), f.discount, ["TUITION"]); assert.deepEqual([r.tax, r.total], [f.expected.tax, f.expected.total], f.name); }
  const mixed = calculate(v1, FIXTURES[1].lines.map(l => ({ ...l, name: l.code })), 100, ["TUITION"]);
  assert.deepEqual(mixed.lines.map(l => [l.code, l.discount, l.category, l.tax]), [["TUITION", 98, "EXEMPT", 0], ["TRANSPORT", 1, "STANDARD", 50], ["BOOKS", 1, "STANDARD", 100]], "the discount spreads by amount, largest remainder");
  const tiny = [{ code: "X", name: "X", amount: 3 }, { code: "Y", name: "Y", amount: 3 }];
  assert.deepEqual([calculate(v1, tiny, 0, []).tax, calculate(v2, tiny, 0, []).tax], [0, 1], "line and total rounding differ, as each version states");
});

test("limitations are explicit; the package must be the campus's own jurisdiction; finance only", async () => {
  const o = await call("finance1", "get", "/api/tax?view=overview");
  assert.equal(o.status, 200);
  const tor = o.json.data.campuses.find((c: { name: string }) => c.name === "Crescent Kuwait");
  assert.match(tor.limitation, /No invoice package exists for KW/, "no compliant badge for an unsupported country");
  assert.equal((await call("teacher", "get", "/api/tax?view=overview")).status, 403);
  assert.equal((await tax("teacher", activation({}))).status, 403);
  const wrong = await tax("finance1", activation({ packageCode: "PK-DEMO", packageVersion: 1 }));
  assert.equal(wrong.status, 400); assert.match(wrong.json.error ?? "", /set up for SA/);
});

test("activation needs identity, owner, dated evidence, a passing fixture run on this exact configuration and a second approver", async () => {
  const d = await tax("finance1", activation({}));
  assert.equal(d.status, 201); ids.a1 = d.json.data.id;
  let row = (await call("finance1", "get", "/api/tax?view=overview")).json.data.activations.find((a: { id: string }) => a.id === ids.a1);
  assert.ok(row.blockers.some((b: string) => /tax number does not have the format/.test(b)));
  assert.ok(row.blockers.some((b: string) => /validation owner/.test(b)) && row.blockers.some((b: string) => /evidence reference/.test(b)) && row.blockers.some((b: string) => /fixtures/.test(b)));
  const early = await tax("finance2", { action: "approve", id: ids.a1 });
  assert.equal(early.status, 409); assert.match(early.json.error ?? "", /unresolved validation requirements/);
  const full = { id: ids.a1, taxId: "300000000000003", ownerId: id("finance2"), evidenceReviewer: "Synthetic Chartered Accountant (QA)", evidenceReference: "SYN-REVIEW-444-01", evidenceReviewedAt: "2026-09-25T00:00:00Z", effectiveFrom: "2026-10-01T00:00:00Z" };
  assert.equal((await tax("finance1", activation(full))).status, 200);
  const bad = await tax("finance1", { action: "fixtures", id: ids.a1, fixtures: [{ ...FIXTURES[0], expected: { tax: 2999, total: 122999 } }] });
  assert.equal(bad.json.data.passed, false);
  assert.match((await tax("finance2", { action: "approve", id: ids.a1 })).json.error ?? "", /did not match/);
  assert.equal((await tax("finance1", { action: "fixtures", id: ids.a1, fixtures: FIXTURES })).json.data.passed, true);
  // A configuration change after the run invalidates it.
  assert.equal((await tax("finance1", activation({ ...full, exemptFeeCodes: ["TUITION", "BOOKS"] }))).status, 200);
  assert.match((await tax("finance2", { action: "approve", id: ids.a1 })).json.error ?? "", /changed after the last fixture run/);
  assert.equal((await tax("finance1", activation(full))).status, 200);
  assert.equal((await tax("finance1", { action: "fixtures", id: ids.a1, fixtures: FIXTURES })).json.data.passed, true);
  assert.equal((await tax("finance1", { action: "approve", id: ids.a1 })).status, 403, "not by the preparer");
  assert.equal((await tax("finance-ar", { action: "approve", id: ids.a1 })).status, 403, "never by the finance desk");
  const ok = await tax("finance2", { action: "approve", id: ids.a1 });
  assert.equal(ok.status, 200, ok.body);
  const a = await db.taxActivation.findUniqueOrThrow({ where: { id: ids.a1 } });
  assert.deepEqual([a.status, a.approvedById, a.ownerId, a.evidenceReference], ["ACTIVE", id("finance2"), id("finance2"), "SYN-REVIEW-444-01"]);
  assert.equal((await tax("finance1", activation({ ...full, legalName: "Changed" }))).status, 409, "an approved activation cannot be edited");
  // PK for the not-supported electronic path.
  const pk = await tax("finance1", { action: "draft", packageCode: "PK-DEMO", packageVersion: 1, campusIds: [lahore], legalName: "Synthetic Crescent Schools (Pvt) Ltd", taxId: "1234567", exemptFeeCodes: [], ownerId: id("finance2"), evidenceReviewer: "Synthetic Tax Adviser (QA)", evidenceReference: "SYN-PK-444", evidenceReviewedAt: "2026-09-20T00:00:00Z", effectiveFrom: "2026-10-01T00:00:00Z" });
  ids.pk = pk.json.data.id;
  assert.equal((await tax("finance1", { action: "fixtures", id: ids.pk, fixtures: [{ name: "Zero-rated", lines: [{ code: "TUITION", amount: 100000 }], discount: 0, expected: { tax: 0, total: 100000 } }] })).json.data.passed, true);
  assert.equal((await tax("finance2", { action: "approve", id: ids.pk })).status, 200);
});

test("issued invoices carry an immutable document; a later version applies only from its date", async () => {
  const oct = await generate(riyadh, "2026-10");
  assert.ok([200, 201].includes(oct.status), oct.body);
  const docs = await db.taxDocument.findMany({ where: { schoolId, campusId: riyadh }, orderBy: { documentNumber: "asc" } });
  assert.deepEqual(docs.map(d => d.documentNumber), ["SAD-000001", "SAD-000002", "SAD-000003"]);
  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: docs[0].invoiceId } });
  assert.deepEqual([invoice.taxAmount, invoice.totalAmount, invoice.currency], [3000, 123000, "SAR"], "tuition exempt, transport at 15%");
  const snap = docs[0].snapshot as { package: { version: number }; seller: { taxId: string }; lines: { code: string; category: string; tax: number }[]; total: number };
  assert.deepEqual([snap.package.version, snap.seller.taxId, snap.total], [1, "300000000000003", 123000]);
  assert.deepEqual(snap.lines.map(l => [l.code, l.category, l.tax]).sort(), [["TRANSPORT", "STANDARD", 3000], ["TUITION", "EXEMPT", 0]]);
  ids.doc1 = docs.find(d => (d.snapshot as { buyer: { name: string } }).buyer.name === "Synthetic Layla Al-Harbi")!.id;
  ids.docReject = docs.find(d => (d.snapshot as { buyer: { name: string } }).buyer.name.startsWith("SYNTHETIC-REJECT"))!.id;
  ids.docTimeout = docs.find(d => (d.snapshot as { buyer: { name: string } }).buyer.name.startsWith("SYNTHETIC-TIMEOUT"))!.id;
  const before = JSON.stringify((await db.taxDocument.findUniqueOrThrow({ where: { id: ids.doc1 } })).snapshot);
  // v2 from November.
  const d2 = await tax("finance1", activation({ packageVersion: 2, taxId: "300000000000003", ownerId: id("finance2"), evidenceReviewer: "Synthetic Chartered Accountant (QA)", evidenceReference: "SYN-REVIEW-444-02", evidenceReviewedAt: "2026-10-12T00:00:00Z", effectiveFrom: "2026-11-01T00:00:00Z" }));
  ids.a2 = d2.json.data.id;
  assert.equal((await tax("finance1", { action: "fixtures", id: ids.a2, fixtures: FIXTURES })).json.data.passed, true);
  const sched = await tax("finance2", { action: "approve", id: ids.a2 });
  assert.equal(sched.status, 200);
  assert.equal((await db.taxActivation.findUniqueOrThrow({ where: { id: ids.a2 } })).status, "SCHEDULED");
  assert.equal(JSON.stringify((await db.taxDocument.findUniqueOrThrow({ where: { id: ids.doc1 } })).snapshot), before, "the October document is unchanged by the new version");
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).totalAmount, 123000);
  const nov = await generate(riyadh, "2026-11");
  assert.ok([200, 201].includes(nov.status), nov.body);
  const novDocs = await db.taxDocument.findMany({ where: { schoolId, campusId: riyadh, packageVersion: 2 } });
  assert.equal(novDocs.length, 3, "November invoices use v2");
  assert.ok(novDocs.every(d => d.activationId === ids.a2 && Number(d.documentNumber.slice(4)) > 3), "the number sequence continues across versions");
  const hist = await call("finance1", "get", `/api/tax?view=document&id=${ids.doc1}`);
  assert.equal(hist.json.data.snapshot.package.version, 1, "a historic copy still shows v1");
  // Unsupported country: no tax document, explicit limitation.
  assert.ok([200, 201].includes((await generate(toronto, "2026-10")).status));
  assert.equal(await db.taxDocument.count({ where: { schoolId, campusId: toronto } }), 0);
  assert.equal((await db.invoice.findFirstOrThrow({ where: { schoolId, campusId: toronto } })).taxAmount, 0);
});

test("electronic submission: queued, accepted, rejected and corrected, with one document identity throughout", async () => {
  const s1 = await tax("finance1", { action: "submit", id: ids.doc1 });
  assert.equal(s1.json.data.status, "ACCEPTED");
  const ext1 = s1.json.data.externalId;
  assert.equal((await tax("finance1", { action: "submit", id: ids.doc1 })).json.data.repeated, true, "an accepted document is not sent again");
  assert.equal((await tax("teacher", { action: "submit", id: ids.doc1 })).status, 403);
  // Rejected → reviewed correction → resubmitted under the same identity.
  const r = await tax("finance1", { action: "submit", id: ids.docReject });
  assert.equal(r.json.data.status, "REJECTED");
  const rejectExt = r.json.data.externalId, rejectNo = (await db.taxDocument.findUniqueOrThrow({ where: { id: ids.docReject } })).documentNumber;
  assert.equal((await tax("finance1", { action: "submit", id: ids.docReject })).status, 409, "a rejected document needs a correction first");
  assert.equal((await tax("finance1", { action: "correct", id: ids.docReject, buyerName: "Synthetic Omar Al-Qahtani", note: "" })).status, 400);
  assert.equal((await tax("finance2", { action: "correct", id: ids.docReject, buyerName: "Synthetic Omar Al-Qahtani", note: "Buyer name corrected to the registered spelling" })).status, 200);
  const corrected = await db.taxDocument.findUniqueOrThrow({ where: { id: ids.docReject } });
  assert.deepEqual([corrected.submissionStatus, corrected.revision, corrected.documentNumber, corrected.externalId], ["CORRECTED", 2, rejectNo, rejectExt]);
  const again = await tax("finance1", { action: "submit", id: ids.docReject });
  assert.deepEqual([again.json.data.status, again.json.data.externalId], ["ACCEPTED", rejectExt]);
  assert.deepEqual((await db.taxSubmissionAttempt.findMany({ where: { documentId: ids.docReject }, orderBy: { attempt: "asc" } })).map(a => [a.attempt, a.revision, a.outcome]), [[1, 1, "REJECTED"], [2, 2, "ACCEPTED"]], "a traceable correction");
  // Timeout → reconcile instead of resending.
  const t = await tax("finance1", { action: "submit", id: ids.docTimeout });
  assert.deepEqual([t.json.data.status, t.json.data.uncertain], ["QUEUED", true]);
  const rec = await tax("finance1", { action: "reconcile", id: ids.docTimeout });
  assert.deepEqual([rec.json.data.status, rec.json.data.externalId], ["ACCEPTED", t.json.data.externalId]);
  assert.equal(await db.taxDocument.count({ where: { schoolId, externalId: t.json.data.externalId } }), 1, "no second document identity");
  assert.ok(ext1 && ext1 !== rejectExt);
  // PK package has no adapter: an explicit limitation, not a submission.
  assert.ok([200, 201].includes((await generate(lahore, "2026-10")).status));
  const pkDoc = await db.taxDocument.findFirstOrThrow({ where: { schoolId, campusId: lahore } });
  assert.deepEqual([pkDoc.submissionStatus, pkDoc.taxAmount, pkDoc.documentNumber], ["NOT_SUPPORTED", 0, "PKD-000001"]);
  const no = await tax("finance1", { action: "submit", id: pkDoc.id });
  assert.equal(no.status, 409); assert.match(no.json.error ?? "", /no electronic submission/);
});

test("screens: package settings with blockers, document preview, Arabic and phone", async () => {
  await tax("finance1", activation({ campusIds: [riyadh], effectiveFrom: "2026-12-01T00:00:00Z" }));
  const p = await (await context("finance2")).newPage();
  await p.goto(`${base}/tax-packages`);
  await p.locator("[data-tx-blockers]").first().waitFor();
  await shot(p, "01-package-settings-blockers");
  await p.locator(`[data-tx-doc="SAD-000001"] [data-tx-doc-view]`).click();
  await p.locator('[data-tax-document="SAD-000001"]').waitFor();
  assert.match(await p.locator('[data-tax-document="SAD-000001"]').innerText(), /300000000000003/);
  await shot(p, "02-document-preview");
  await p.close();
  const ar = await (await context("finance-ar")).newPage();
  await ar.goto(`${base}/tax-packages`);
  await ar.locator("[data-tax-packages]").waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await ar.locator(`[data-tx-doc="SAD-000001"] [data-tx-doc-view]`).click();
  await ar.locator('[data-tax-document="SAD-000001"]').waitFor();
  await shot(ar, "03-document-ar");
  await ar.close();
  const phone = await (await context("finance2", { width: 390, height: 844 })).newPage();
  await phone.goto(`${base}/tax-packages`);
  await phone.locator("[data-tax-documents]").waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no sideways scroll at phone width");
  await shot(phone, "04-phone");
  await phone.close();
  const t = await (await context("teacher")).newPage();
  await t.goto(`${base}/tax-packages`);
  await t.locator("[data-tax-denied]").waitFor();
  await t.close();
});
