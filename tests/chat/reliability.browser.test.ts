import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { assertPortFree, qaAppUrl, qaDbPort, qaFakeS3Port } from "../support/qa-env";

// SKO-415 on the isolated app (its S3 endpoint is a synthetic in-process store on QA_FAKE_S3_PORT, default :55441): a retried send
// keeps one message; attachments must be stored in this conversation with the checked size before they
// can be sent; reconnect fetches everything after the last confirmed message; quiet hours hold back all
// but staff-marked urgent notifications, and previews never carry message text; a lost acknowledgement
// leaves an "unconfirmed" bubble whose Retry cannot duplicate; failed uploads keep the draft.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== String(qaDbPort()) || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${qaDbPort()} is allowed`);
const base = qaAppUrl(process.env.CHAT_TEST_APP);
const evidence = process.env.CHAT_EVIDENCE_DIR || "/tmp/sko415-evidence";
const db = new PrismaClient(), password = "SyntheticChat415!";
const schoolId = `chat415-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const objects = new Map<string, { body: Buffer; type: string }>();
let browser: Browser, s3: Server, conversationId = "", otherConversationId = "";

function startFakeS3() {
  s3 = createServer((req, res) => {
    const key = decodeURIComponent((req.url ?? "").split("?")[0].replace(/^\/synthetic-only\//, ""));
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => {
        if (req.headers["if-none-match"] === "*" && objects.has(key)) { res.writeHead(412).end(); return; }
        objects.set(key, { body: Buffer.concat(chunks), type: String(req.headers["content-type"] ?? "application/octet-stream") });
        res.writeHead(200, { ETag: '"synthetic"' }).end();
      });
      return;
    }
    const object = objects.get(key);
    if (!object) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Length": String(object.body.length), "Content-Type": object.type, ETag: '"synthetic"' });
    res.end(req.method === "HEAD" ? undefined : object.body);
  }).listen(qaFakeS3Port(), "127.0.0.1");
}

async function user(key: string, role: string) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true } });
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
const send = (ctx: BrowserContext, body: Record<string, unknown>, id = conversationId) => ctx.request.post(`${base}/api/chat/conversations/${id}/messages`, { data: body });
async function upload(ctx: BrowserContext, fileName: string, contentType: string, bytes: Buffer, declared = bytes.length) {
  const presign = await ctx.request.post(`${base}/api/chat/attachments`, { data: { conversationId, fileName, contentType, sizeBytes: declared } });
  const { storageKey, uploadUrl } = await presign.json();
  return { presign, storageKey: storageKey as string, uploadUrl: uploadUrl as string, put: () => ctx.request.put(base + uploadUrl, { headers: { "Content-Type": contentType }, data: bytes }) };
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await assertPortFree(qaFakeS3Port(), "fake S3", "QA_FAKE_S3_PORT");
  startFakeS3();
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Messaging School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO", timezone: "Asia/Karachi" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar Messaging", regId: campusId, city: "Karachi" } });
  await user("admin", "CAMPUS_ADMIN"); await user("teacher", "TEACHER"); await user("coach", "TEACHER");
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const admin = await context("admin");
  const direct = await admin.request.post(`${base}/api/chat/conversations`, { data: { kind: "DIRECT", userId: users.get("teacher")!.id } });
  assert.equal(direct.status(), 200, await direct.text());
  conversationId = (await direct.json()).conversation.id;
  otherConversationId = (await (await admin.request.post(`${base}/api/chat/conversations`, { data: { kind: "DIRECT", userId: users.get("coach")!.id } })).json()).conversation.id;
});
after(async () => { await browser?.close(); s3?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("a retried send keeps one authoritative message; another sender cannot claim the identifier", async () => {
  const admin = await context("admin"), teacher = await context("teacher"), clientKey = randomUUID();
  const replies = await Promise.all([1, 2, 3].map(() => send(admin, { body: "Synthetic: staff meeting moved to 2pm", clientKey })));
  assert.deepEqual(replies.map(r => r.status()), [200, 200, 200]);
  const ids = new Set(await Promise.all(replies.map(async r => (await r.json()).message.id)));
  assert.equal(ids.size, 1);
  assert.equal(await db.chatMessage.count({ where: { conversationId, clientKey } }), 1);
  const stolen = await send(teacher, { body: "Synthetic other text", clientKey });
  assert.equal(stolen.status(), 409);
});

test("an attachment is sent only after it is stored in this conversation with the checked size", async () => {
  const admin = await context("admin"), pdf = Buffer.from("%PDF-1.4 synthetic timetable");
  assert.equal((await admin.request.post(`${base}/api/chat/attachments`, { data: { conversationId, fileName: "run.exe", contentType: "application/x-msdownload", sizeBytes: 10 } })).status(), 400);
  const forged = await send(admin, { body: "", attachments: [{ storageKey: `chat/${schoolId}/${otherConversationId}/x-file.pdf`, fileName: "x.pdf", contentType: "application/pdf", sizeBytes: pdf.length }] });
  assert.equal(forged.status(), 400, "a key from another conversation is refused");
  const pending = await upload(admin, "timetable.pdf", "application/pdf", pdf);
  const early = await send(admin, { body: "Synthetic timetable", attachments: [{ storageKey: pending.storageKey, fileName: "timetable.pdf", contentType: "application/pdf", sizeBytes: pdf.length }] });
  assert.equal(early.status(), 409);
  assert.match((await early.json()).error, /has not finished uploading/);
  assert.equal((await pending.put()).status(), 200);
  const tampered = await send(admin, { body: "Synthetic timetable", attachments: [{ storageKey: pending.storageKey, fileName: "timetable.pdf", contentType: "application/pdf", sizeBytes: pdf.length + 5 }] });
  assert.equal(tampered.status(), 409, "a size that differs from the stored file is refused");
  const sent = await send(admin, { body: "Synthetic timetable", clientKey: randomUUID(), attachments: [{ storageKey: pending.storageKey, fileName: "timetable.pdf", contentType: "application/pdf", sizeBytes: pdf.length }] });
  assert.equal(sent.status(), 200, await sent.text());
  const attachment = (await sent.json()).message.attachments[0];
  assert.equal(await (await (await context("teacher")).request.get(base + attachment.url)).text(), pdf.toString());
  assert.equal((await (await context("coach")).request.get(base + attachment.url)).status(), 403, "a non-member cannot fetch it");
});

test("after a reconnect the thread fetches exactly the messages after the last confirmed one", async () => {
  const admin = await context("admin"), teacher = await context("teacher");
  const first = (await (await send(admin, { body: "Synthetic gap anchor", clientKey: randomUUID() })).json()).message;
  for (const n of [1, 2, 3, 4]) await send(admin, { body: `Synthetic missed ${n}`, clientKey: randomUUID() });
  const page = await (await teacher.request.get(`${base}/api/chat/conversations/${conversationId}/messages?after=${first.id}&limit=3`)).json();
  assert.deepEqual([page.messages.map((m: { body: string }) => m.body), page.hasMoreAfter], [["Synthetic missed 1", "Synthetic missed 2", "Synthetic missed 3"], true]);
  const rest = await (await teacher.request.get(`${base}/api/chat/conversations/${conversationId}/messages?after=${page.messages[2].id}`)).json();
  assert.deepEqual(rest.messages.map((m: { body: string }) => m.body), ["Synthetic missed 4"]);
  assert.equal((await teacher.request.get(`${base}/api/chat/conversations/${conversationId}/messages?after=${randomUUID()}`)).status(), 400);
  const member = await db.conversationMember.findUniqueOrThrow({ where: { conversationId_userId: { conversationId, userId: users.get("teacher")!.id } } });
  const stored = await db.chatMessage.count({ where: { conversationId, senderId: users.get("admin")!.id } });
  assert.equal(member.unreadCount, stored, "unread equals the stored messages from the other side");
  assert.equal((await teacher.request.post(`${base}/api/chat/conversations/${conversationId}/read`)).status(), 200);
  assert.equal((await db.conversationMember.findUniqueOrThrow({ where: { conversationId_userId: { conversationId, userId: users.get("teacher")!.id } } })).unreadCount, 0);
});

test("quiet hours hold back all but explicit urgent notifications, and previews never carry the text", async () => {
  const admin = await context("admin"), teacherId = users.get("teacher")!.id;
  await db.chatSetting.upsert({ where: { schoolId }, create: { schoolId, quietHoursEnabled: false }, update: { quietHoursEnabled: false } });
  await send(admin, { body: "Synthetic SECRET-BODY-1 about a pupil", clientKey: randomUUID() });
  const normal = await db.notification.findMany({ where: { userId: teacherId, type: "CHAT_MESSAGE" } });
  assert.ok(normal.length >= 1);
  assert.equal(normal.some(n => n.message.includes("SECRET-BODY")), false, "notification previews hold no message text");
  await db.notification.deleteMany({ where: { userId: teacherId } });
  await db.chatSetting.update({ where: { schoolId }, data: { quietHoursEnabled: true, quietHoursStart: "00:00", quietHoursEnd: "23:59" } });
  await send(admin, { body: "Synthetic routine note in quiet hours", clientKey: randomUUID() });
  assert.equal(await db.notification.count({ where: { userId: teacherId } }), 0, "routine message held back during quiet hours");
  const urgent = await send(admin, { body: "Synthetic SECRET-BODY-2 gate closed", clientKey: randomUUID(), urgent: true });
  assert.equal((await urgent.json()).message.isUrgent, true);
  const notes = await db.notification.findMany({ where: { userId: teacherId } });
  assert.deepEqual(notes.map(n => n.message), ["Urgent message. Open Messages to read it."]);
  await db.chatSetting.update({ where: { schoolId }, data: { quietHoursEnabled: false } });
});

test("a lost acknowledgement leaves an unconfirmed bubble; Retry keeps one message; refusals and failed uploads keep the draft", async () => {
  const teacher = await context("teacher"), page = await teacher.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  // The live stream is down too, so nothing but the lost response could have confirmed the send.
  await page.route("**/api/chat/stream", route => route.abort("connectionrefused"));
  await page.goto(`${base}/messages?c=${conversationId}`);
  const composer = page.getByRole("textbox").last();
  await composer.waitFor({ timeout: 30_000 });
  // The server stores the message, then the response is lost on the way back.
  let dropped = false;
  await page.route(`**/api/chat/conversations/${conversationId}/messages`, async route => {
    if (route.request().method() !== "POST" || dropped) return route.fallback();
    dropped = true;
    await route.fetch();
    await route.abort("connectionreset");
  });
  await composer.fill("Synthetic: please share the field trip list");
  await composer.press("Enter");
  const unconfirmed = page.locator('[data-send-state="unconfirmed"]');
  await unconfirmed.waitFor({ timeout: 15_000 });
  assert.match(await unconfirmed.innerText(), /Retrying is safe/);
  await unconfirmed.scrollIntoViewIfNeeded();
  await shot(page, "chat-unconfirmed-en-1440");
  await unconfirmed.getByRole("button", { name: "Retry sending this message" }).click();
  await page.locator('[data-send-state="unconfirmed"]').waitFor({ state: "detached", timeout: 15_000 });
  assert.equal(await page.getByText("Synthetic: please share the field trip list").count(), 1, "one bubble");
  assert.equal(await db.chatMessage.count({ where: { conversationId, body: "Synthetic: please share the field trip list" } }), 1, "one stored message");
  await page.unroute(`**/api/chat/conversations/${conversationId}/messages`);
  await page.unroute("**/api/chat/stream");

  await page.route(`**/api/chat/conversations/${conversationId}/messages`, route => route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic outage" }) }) : route.fallback());
  await composer.fill("Synthetic: refused message");
  await composer.press("Enter");
  const failed = page.locator('[data-send-state="failed"]');
  await failed.waitFor({ timeout: 15_000 });
  assert.match(await failed.innerText(), /Not sent: Synthetic outage/);
  await failed.getByRole("button", { name: "Discard this unsent message" }).click();
  assert.equal(await page.getByText("Synthetic: refused message").count(), 0);
  await page.unroute(`**/api/chat/conversations/${conversationId}/messages`);

  let failUpload = true;
  await page.route("**/api/uploads/file**", route => failUpload ? route.abort("failed") : route.fallback());
  await composer.fill("Synthetic: photo of the notice board");
  await page.locator('input[type="file"]').setInputFiles({ name: "notice.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await page.getByText(/Your message draft is still here/).waitFor({ timeout: 15_000 });
  assert.equal(await composer.inputValue(), "Synthetic: photo of the notice board");
  await shot(page, "chat-upload-failed-en-1440");
  failUpload = false;
  await page.getByRole("button", { name: "Retry upload of notice.png" }).click();
  await page.locator('[data-upload-state="ready"]').waitFor({ timeout: 15_000 });
  await composer.press("Enter");
  let stored = 0;
  for (let attempt = 0; attempt < 30 && stored === 0; attempt++) {
    stored = await db.chatAttachment.count({ where: { message: { conversationId, body: "Synthetic: photo of the notice board" } } });
    if (!stored) await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(stored, 1, "the message and its retried upload were sent once");
  await page.locator('li:has-text("Synthetic: photo of the notice board") [data-send-state="sent"], li:has-text("Synthetic: photo of the notice board") [data-send-state="seen"]').first().waitFor({ timeout: 15_000 });
  await shot(page, "chat-thread-sent-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});
