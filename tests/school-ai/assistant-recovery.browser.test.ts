import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-460 browser acceptance on the isolated app: live voice asks for consent and shows an editable,
// unverified transcript that is sent only on request; a voice turn never replaces typed text; an
// unsent draft survives a reload for the same user only; a conversation can be exported and deleted.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.ASSISTANT_TEST_APP || "http://localhost:3107";
const evidence = process.env.ASSISTANT_EVIDENCE_DIR || "/tmp/sko460-evidence";
const db = new PrismaClient(), password = "SyntheticAssistant460!";
const schoolId = `ast460-${randomUUID()}`, campusId = randomUUID();
const people = new Map<string, { id: string; email: string }>();
let browser: Browser;

async function person(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, { id, email });
}
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
async function context(key: string, viewport = { width: 1440, height: 1000 }): Promise<BrowserContext> {
  // A signed-in session is reused: after MFA enrolment a fresh password login would need a challenge.
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, reducedMotion: "reduce", storageState: saved });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png` }); };
/** No provider runs in this environment: capabilities, transcription and the reply are synthetic. */
async function stubAi(page: Page, onAsk?: (body: Record<string, unknown>) => void) {
  await page.route("**/api/school-ai/capabilities", route => route.fulfill({ json: { documentUpload: true, documentExtraction: false, voiceTranscription: true, assistant: true, paperGeneration: false, liveVoice: true, secureBrowser: false, proctoring: false } }));
  await page.route("**/api/school-ai/transcribe", route => route.fulfill({ json: { text: "Help plan a school day.", confidence: "low", uncertain: ["school day"] } }));
  await page.route("**/api/school-ai/assistant", route => { onAsk?.(route.request().postDataJSON()); return route.fulfill({ json: { reply: "Let us review your school day together." } }); });
}
async function fakeMicrophone(page: Page) {
  // Passed as source text: tsx would otherwise inject a __name helper the page does not have.
  await page.addInitScript({ content: `
    const probe = { gum: 0, started: 0 }; window.__probe = probe;
    const track = { enabled: true, stop() {} };
    const fakeGetUserMedia = async () => { probe.gum++; return { getTracks: () => [track] }; };
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: fakeGetUserMedia });
    else Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: fakeGetUserMedia } });
    window.AudioContext = function () { let n = 0; return { resume: async () => {}, close: async () => {}, createMediaStreamSource: () => ({ connect() {}, disconnect() {} }), createAnalyser: () => ({ fftSize: 512, getFloatTimeDomainData: values => values.fill(n++ < 6 ? 0.3 : 0) }) }; };
    const Recorder = function () { const self = { state: "inactive", mimeType: "audio/webm", ondataavailable: null, onstop: null, onerror: null,
      start() { self.state = "recording"; probe.started++; },
      stop() { self.state = "inactive"; self.ondataavailable && self.ondataavailable({ data: new Blob(["synthetic-audio"], { type: self.mimeType }) }); setTimeout(() => self.onstop && self.onstop(), 0); } }; return self; };
    Recorder.isTypeSupported = () => true;
    window.MediaRecorder = Recorder;
    window.SpeechSynthesisUtterance = function (text) { return { text, lang: "", voice: null, rate: 1, onend: null, onerror: null }; };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => [{ lang: "en-US" }], speak() {}, cancel() {} } });
  ` });
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Willow Assistant School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Willow Main", regId: campusId, city: "Karachi" } });
  await person("admin", "CAMPUS_ADMIN"); await person("other", "CAMPUS_ADMIN"); await person("admin-ur", "CAMPUS_ADMIN", "ur");
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("live voice asks consent, shows an editable unverified transcript, and sends only what the user approves", async () => {
  const ctx = await context("admin"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const sent: string[] = [];
  await stubAi(page, body => sent.push(String(body.message)));
  await fakeMicrophone(page);
  await page.goto(`${base}/ai`);
  const composer = page.getByRole("textbox", { name: "Message or answer", exact: true });
  await composer.fill("Keep this typed note.");
  await page.getByRole("button", { name: "Start voice conversation", exact: true }).click();
  await page.getByText(/audio is not kept/).waitFor();
  await page.getByRole("button", { name: "Allow and start", exact: true }).click();
  const review = page.getByRole("textbox", { name: "Check what was heard", exact: true });
  await review.waitFor();
  assert.equal(await review.inputValue(), "Help plan a school day.");
  assert.deepEqual(sent, [], "nothing is sent before the user checks it");
  assert.match(await page.locator("[data-voice-uncertain]").innerText(), /unsure of: school day/, "the reviewer is pointed at the uncertain words");
  await review.fill("Help plan a school day for Grade 7.");
  await shot(page, "voice-review-en-1440");
  await page.getByRole("button", { name: "Send to assistant", exact: true }).click();
  await page.getByRole("button", { name: "Interrupt and speak", exact: true }).waitFor();
  assert.deepEqual((sent as string[]).map(message => message.endsWith("Help plan a school day for Grade 7.")), [true], "the edited transcript is what was sent");
  assert.equal(await composer.inputValue(), "Keep this typed note.", "a voice turn never replaces typed text");
  assert.deepEqual(errors, []); await ctx.close();
});

test("an unsent draft survives a reload for the same user, and another user signing in on the same browser does not see it", async () => {
  const ctx = await context("admin"), page = await ctx.newPage();
  await stubAi(page);
  await page.goto(`${base}/ai`);
  const composer = page.getByRole("textbox", { name: "Message or answer", exact: true });
  await composer.fill("A careful draft about Friday's timetable.");
  await page.waitForTimeout(300);
  await page.reload();
  await composer.waitFor();
  await page.waitForFunction(() => (document.querySelector('textarea[aria-label="Message or answer"], textarea') as HTMLTextAreaElement | null)?.value?.includes("Friday"), undefined, { timeout: 10_000 }).catch(() => undefined);
  assert.equal(await composer.inputValue(), "A careful draft about Friday's timetable.");
  // Same tab, a different person signs in: the draft is keyed to the first user and stays hidden.
  await ctx.clearCookies();
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get("other")!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  await page.reload();
  await composer.waitFor();
  await page.waitForTimeout(800);
  assert.equal(await composer.inputValue(), "", "another person never sees the first user's draft");
  await ctx.close();
});

test("the owner exports and deletes a conversation from the assistant (EN), and the Urdu panel reads right-to-left", async () => {
  const conversationId = randomUUID(), admin = people.get("admin")!;
  await db.schoolAiConversation.create({ data: { id: conversationId, schoolId, campusId, actorId: admin.id, actorRole: "CAMPUS_ADMIN", title: "Synthetic planning chat", idempotencyKey: randomUUID(), requestHash: "synthetic", version: 0 } });
  const ctx = await context("admin"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await stubAi(page);
  await page.goto(`${base}/ai`);
  await page.locator("[data-delete-conversation]").first().waitFor();
  const exported = await ctx.request.get(`${base}${await page.locator("[data-export-conversation]").first().getAttribute("href")}`);
  assert.equal(exported.status(), 200);
  assert.match(exported.headers()["content-disposition"] ?? "", /attachment/);
  assert.equal((await exported.json()).conversation.title, "Synthetic planning chat");
  await page.locator("[data-delete-conversation]").first().click();
  await shot(page, "assistant-delete-confirm-en-1440");
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).getByRole("button", { name: "Delete conversation" }).click();
  await page.getByText("Conversation deleted.").waitFor();
  assert.equal(await db.schoolAiConversation.count({ where: { id: conversationId } }), 0);
  assert.deepEqual(errors, []); await ctx.close();
  const ur = await context("admin-ur", { width: 390, height: 844 }), urPage = await ur.newPage();
  await stubAi(urPage);
  await urPage.goto(`${base}/ai`);
  await urPage.getByRole("textbox").first().waitFor();
  assert.equal(await urPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await shot(urPage, "assistant-ur-390");
  await ur.close();
});

test("a rate-limited recording explains itself in the reader's language and keeps typed text (UR)", async () => {
  const ctx = await context("admin-ur", { width: 390, height: 844 }), page = await ctx.newPage();
  await stubAi(page);
  await page.unroute("**/api/school-ai/transcribe");
  await page.route("**/api/school-ai/transcribe", route => route.fulfill({ status: 429, json: { error: "Please wait before sending another recording." } }));
  await fakeMicrophone(page);
  await page.goto(`${base}/ai`);
  await page.getByRole("button").filter({ hasText: /صوتی گفتگو شروع کریں/ }).click({ timeout: 30_000 });
  await page.locator("[data-voice-consent] button").first().click({ timeout: 15_000 });
  await page.getByText("کم وقت میں بہت زیادہ ریکارڈنگز").waitFor({ timeout: 15_000 });
  assert.equal(await page.getByText("Please wait before sending another recording.").count(), 0, "the English server message is not shown");
  await shot(page, "voice-rate-limited-ur-390");
  await ctx.close();
});

for (const [key, viewport, label] of [["admin", { width: 320, height: 720 }, "en-320"], ["admin-ur", { width: 768, height: 1024 }, "ur-768"], ["admin", { width: 720, height: 500 }, "en-200pct-zoom"]] as const) {
  test(`the assistant fits without horizontal scrolling (${label})`, async () => {
    const ctx = await context(key, viewport), page = await ctx.newPage();
    await stubAi(page);
    await page.goto(`${base}/ai`);
    await page.getByRole("textbox").first().waitFor({ timeout: 30_000 });
    assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
    if (label === "en-320") await shot(page, "assistant-en-320");
    await ctx.close();
  });
}

test("keyboard only: start voice, accept consent and reach the editable transcript", async () => {
  const ctx = await context("admin"), page = await ctx.newPage();
  await stubAi(page);
  await fakeMicrophone(page);
  await page.goto(`${base}/ai`);
  const start = page.getByRole("button", { name: "Start voice conversation", exact: true });
  await start.waitFor({ timeout: 30_000 });
  for (let i = 0; i < 50 && !(await start.isEnabled()); i++) await page.waitForTimeout(200);
  await start.focus();
  await page.keyboard.press("Enter");
  const allow = page.getByRole("button", { name: "Allow and start", exact: true });
  await allow.waitFor();
  await allow.focus();
  assert.equal(await page.evaluate("document.activeElement?.textContent?.trim()"), "Allow and start");
  await page.keyboard.press("Enter");
  const review = page.getByRole("textbox", { name: "Check what was heard", exact: true });
  await review.waitFor();
  await review.focus();
  await page.evaluate(`(() => { const el = document.activeElement; el.setSelectionRange(el.value.length, el.value.length); })()`);
  await page.keyboard.type(" for Grade 8");
  assert.match(await review.inputValue(), /for Grade 8$/);
  await ctx.close();
});
