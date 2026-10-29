import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-463 on the isolated app: the last place cannot be taken twice; one pupil cannot hold two rooms at
// once; moves keep continuous history and replay safely; capacity and out-of-service changes cannot
// strand residents; residents carry minimal fields; other campuses and non-boarding roles see nothing.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DORM_TEST_APP || "http://localhost:3107";
const evidence = process.env.DORM_EVIDENCE_DIR || "/tmp/sko463-evidence";
const db = new PrismaClient(), password = "SyntheticDorm463!";
const schoolId = `dorm463-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), classId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const rooms: Record<string, string> = {}, pupils: Record<string, string> = {};
let browser: Browser, winner = "", winnerStay = "", movedStay = "", upcomingStay = "";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const plus = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function user(key: string, role: string, campus: string | null = campusId, language = "en") {
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
const api = `${base}/api/dormitory/allocations`;
const post = (ctx: BrowserContext, body: Record<string, unknown>) => ctx.request.post(api, { data: { action: "allocate", reason: "Synthetic boarding arrangement", ...body } });
const occupancy = async (ctx: BrowserContext, date: string) => Object.fromEntries((await (await ctx.request.get(`${api}?date=${date}`)).json()).data.rooms.map((room: { number: string; occupied: number }) => [room.number, room.occupied]));
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cypress Boarding School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [id, name] of [[campusId, "Cypress Hill"], [otherCampusId, "Cypress Vale"]]) await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Lahore" } });
  const warden = await user("warden", "CAMPUS_ADMIN"); await user("warden-ar", "CAMPUS_ADMIN", campusId, "ar"); await user("other", "CAMPUS_ADMIN", otherCampusId); await user("teacher", "TEACHER");
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Karachi", currency: "PKR" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: warden, financeReviewedBy: warden } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Nine", academicYear: 2026 } });
  const type = await db.dormRoomType.create({ data: { schoolId, campusId, name: "Shared" } });
  for (const [number, capacity, status] of [["A-101", 2, "AVAILABLE"], ["A-102", 1, "AVAILABLE"], ["A-103", 2, "OUT_OF_SERVICE"], ["A-104", 3, "AVAILABLE"]] as const) rooms[number] = (await db.dormRoom.create({ data: { schoolId, campusId, roomTypeId: type.id, number, capacity, status, statusReason: status === "OUT_OF_SERVICE" ? "Synthetic plumbing repair" : null } })).id;
  for (const [key, name, roll] of [["ali", "Synthetic Ali Cypress", "B-1"], ["sara", "Synthetic Sara Cypress", "B-2"], ["hina", "Synthetic Hina Cypress", "B-3"], ["omar", "Synthetic Omar Cypress", "B-4"], ["nadia", "Synthetic Nadia Cypress", "B-6"], ["gone", "Synthetic Archived Cypress", "B-5"]]) {
    pupils[key] = (await db.student.create({ data: { schoolId, campusId, classId, fullName: name, rollNo: roll, gender: "OTHER", enrollmentDate: new Date("2026-04-01Z"), ...(key === "gone" ? { archivedAt: new Date() } : {}) } })).id;
  }
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("two wardens taking the last place: one allocation and an actionable conflict", async () => {
  const ctx = await context("warden");
  const results = await Promise.all([pupils.ali, pupils.sara].map(studentId => post(ctx, { studentId, roomId: rooms["A-102"], startDate: today, idempotencyKey: randomUUID() })));
  assert.deepEqual(results.map(r => r.status()).sort(), [201, 409]);
  const conflict = results.find(r => r.status() === 409)!;
  assert.match((await conflict.json()).error, /Room A-102 is full \(1 of 1 places\)/);
  const created = (await results.find(r => r.status() === 201)!.json()).data;
  winner = created.studentId; winnerStay = created.id;
  assert.equal(await db.dormAllocation.count({ where: { roomId: rooms["A-102"] } }), 1);
  assert.equal((await db.student.findUniqueOrThrow({ where: { id: winner } })).dormRoomId, rooms["A-102"], "current room follows the dated stay");
});

test("overlaps, unavailable rooms, bad dates and archived pupils are refused; a retry posts once", async () => {
  const ctx = await context("warden");
  const overlap = await post(ctx, { studentId: winner, roomId: rooms["A-104"], startDate: plus(3) });
  assert.equal(overlap.status(), 409);
  assert.match((await overlap.json()).error, /already has room A-102/);
  const out = await post(ctx, { studentId: pupils.hina, roomId: rooms["A-103"], startDate: today });
  assert.equal(out.status(), 409);
  assert.match((await out.json()).error, /out of service/);
  assert.equal((await post(ctx, { studentId: pupils.hina, roomId: rooms["A-104"], startDate: plus(5), endDate: plus(5) })).status(), 400);
  assert.equal((await post(ctx, { studentId: pupils.hina, roomId: rooms["A-104"], startDate: "2026-02-30" })).status(), 400);
  assert.equal((await post(ctx, { studentId: pupils.gone, roomId: rooms["A-104"], startDate: today })).status(), 409);
  assert.equal((await post(ctx, { studentId: pupils.hina, roomId: rooms["A-104"], startDate: today, reason: "" })).status(), 400);
  const key = randomUUID();
  const replies = await Promise.all([1, 2, 3].map(() => post(ctx, { studentId: pupils.hina, roomId: rooms["A-101"], startDate: plus(10), idempotencyKey: key })));
  assert.deepEqual(replies.map(r => r.status()).sort(), [200, 200, 201]);
  assert.equal(await db.dormAllocation.count({ where: { studentId: pupils.hina } }), 1);
  upcomingStay = (await replies[0].json()).data.id;
  assert.equal((await post(ctx, { studentId: pupils.hina, roomId: rooms["A-101"], startDate: plus(11), idempotencyKey: key })).status(), 409, "a changed retry is refused");
});

test("a move keeps continuous history, replays safely and respects the future reservation", async () => {
  const ctx = await context("warden");
  const move = { action: "move", id: winnerStay, toRoomId: rooms["A-101"], moveDate: plus(5), reason: "Synthetic: closer to the study hall" };
  const first = await post(ctx, move);
  assert.equal(first.status(), 200);
  movedStay = (await first.json()).data.id;
  const replay = await post(ctx, move);
  assert.deepEqual([replay.status(), (await replay.json()).replayed], [200, true]);
  assert.equal((await post(ctx, { ...move, toRoomId: rooms["A-104"] })).status(), 409, "a different second move is refused");
  const history = (await (await ctx.request.get(`${api}?studentId=${winner}`)).json()).data.stays;
  assert.deepEqual(history.map((stay: { roomNumber: string; startDate: string; endDate: string | null }) => [stay.roomNumber, stay.startDate, stay.endDate]), [["A-102", today, plus(5)], ["A-101", plus(5), null]]);
  assert.equal(history[1].previousId, winnerStay);
  assert.deepEqual([(await occupancy(ctx, plus(4)))["A-102"], (await occupancy(ctx, plus(6)))["A-102"], (await occupancy(ctx, plus(6)))["A-101"], (await occupancy(ctx, plus(10)))["A-101"]], [1, 0, 1, 2]);
  const full = await post(ctx, { studentId: pupils.omar, roomId: rooms["A-101"], startDate: plus(12) });
  assert.equal(full.status(), 409, "the reservation and the moved pupil fill the room");
  assert.equal((await post(ctx, { studentId: pupils.omar, roomId: rooms["A-101"], startDate: today, endDate: plus(5) })).status(), 201, "a stay that ends before both arrive fits");
});

test("SKAI-1064: creating a room type and a room returns 201 Created", async () => {
  const ctx = await context("warden");
  const type = await ctx.request.post(`${base}/api/dormitory/room-types`, { data: { campusId, name: `Synthetic type ${Date.now()}` } });
  assert.equal(type.status(), 201);
  const typeId = (await type.json()).data.id;
  const room = await ctx.request.post(`${base}/api/dormitory/rooms`, { data: { campusId, roomTypeId: typeId, number: `Z-${Date.now()}`, capacity: 2 } });
  assert.equal(room.status(), 201);
  assert.ok((await room.json()).data.id);
});

test("capacity and out-of-service changes show their impact and cannot strand residents", async () => {
  const ctx = await context("warden"), roomsApi = `${base}/api/dormitory/rooms`;
  const preview = await (await ctx.request.patch(roomsApi, { data: { id: rooms["A-101"], capacity: 1, dryRun: true } })).json();
  assert.equal(preview.data.blocked, true);
  assert.equal(preview.data.peak, 2);
  const lower = await ctx.request.patch(roomsApi, { data: { id: rooms["A-101"], capacity: 1 } });
  assert.equal(lower.status(), 409);
  assert.equal((await lower.json()).impact.affected.length, 3);
  assert.equal((await ctx.request.patch(roomsApi, { data: { id: rooms["A-104"], status: "OUT_OF_SERVICE" } })).status(), 400, "a reason is required");
  const strand = await ctx.request.patch(roomsApi, { data: { id: rooms["A-101"], status: "OUT_OF_SERVICE", statusReason: "Synthetic leak" } });
  assert.equal(strand.status(), 409);
  assert.match((await strand.json()).error, /Move or end them/);
  assert.equal((await db.dormRoom.findUniqueOrThrow({ where: { id: rooms["A-101"] } })).capacity, 2, "nothing changed");
  assert.equal((await ctx.request.patch(roomsApi, { data: { id: rooms["A-104"], status: "OUT_OF_SERVICE", statusReason: "Synthetic repainting" } })).status(), 200);
  assert.equal((await ctx.request.patch(roomsApi, { data: { id: rooms["A-104"], status: "AVAILABLE" } })).status(), 200);
  assert.equal((await ctx.request.delete(`${roomsApi}?id=${rooms["A-102"]}`)).status(), 409, "rooms with history are kept");
  assert.equal((await post(ctx, { action: "cancel", id: movedStay, reason: "Synthetic attempt on a current stay" })).status(), 409);
  assert.equal((await post(ctx, { action: "cancel", id: upcomingStay, reason: "Synthetic: family changed plans" })).status(), 200);
  assert.equal((await post(ctx, { action: "end", id: movedStay, endDate: plus(20), reason: "Synthetic: term ends" })).status(), 200);
  const audit = await db.auditLog.count({ where: { tableName: { in: ["dorm_allocations", "dorm_rooms"] }, schoolId } });
  assert.ok(audit >= 7, `allocation and room changes are audited (${audit})`);
});

test("residents carry minimal fields; other campuses and non-boarding roles are refused", async () => {
  const ctx = await context("warden");
  const stay = (await (await ctx.request.get(api)).json()).data.stays[0];
  assert.deepEqual(Object.keys(stay.student).sort(), ["className", "fullName", "id", "rollNo"]);
  const teacher = await context("teacher");
  assert.equal((await teacher.request.get(api)).status(), 403);
  assert.equal((await post(teacher, { studentId: pupils.omar, roomId: rooms["A-104"], startDate: plus(30) })).status(), 403);
  const other = await context("other");
  assert.equal((await other.request.get(`${api}?campusId=${campusId}`)).status(), 403);
  assert.equal((await post(other, { action: "end", id: movedStay, endDate: plus(15) })).status(), 404);
  assert.equal((await post(other, { studentId: pupils.omar, roomId: rooms["A-104"], startDate: plus(30) })).status(), 404);
});

test("the warden allocates from the dialog and sees the impact before taking a room out of service", async () => {
  const ctx = await context("warden"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin?view=dormitory`);
  const panel = page.locator("[data-dorm-allocations]");
  await panel.locator('[data-dorm-room="A-104"]').waitFor({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Allocate student" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Allocate", exact: true }).click();
  await dialog.locator("[data-dorm-error]").waitFor();
  await dialog.getByLabel("Find student by name or roll number").fill("Nadia");
  await dialog.getByRole("radio", { name: /Synthetic Nadia Cypress/ }).check({ timeout: 10_000 });
  await dialog.getByLabel("Room", { exact: true }).selectOption({ label: "A-104 · 3 free" });
  await dialog.getByLabel("Reason").fill("Synthetic: new boarder this term");
  await dialog.locator("[data-dorm-preview]").waitFor();
  await shot(page, "dorm-allocate-dialog-en-1440");
  await dialog.getByRole("button", { name: "Allocate", exact: true }).click();
  await panel.locator('[data-dorm-room="A-104"][data-room-occupied="1"]').waitFor({ timeout: 15_000 });
  await shot(page, "dorm-occupancy-en-1440");
  await panel.locator('[data-dorm-room="A-104"]').getByRole("button", { name: "Capacity and status" }).click();
  const roomDialog = page.getByRole("dialog");
  await roomDialog.getByLabel("Status").selectOption("OUT_OF_SERVICE");
  await roomDialog.locator('[data-dorm-impact="blocked"]').waitFor({ timeout: 10_000 });
  assert.match(await roomDialog.locator("[data-dorm-impact]").innerText(), /Synthetic Nadia Cypress/);
  assert.equal(await roomDialog.getByRole("button", { name: "Save room" }).isDisabled(), true);
  await shot(page, "dorm-room-impact-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Arabic warden at phone width reads occupancy right-to-left without overflow", async () => {
  const ctx = await context("warden-ar", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/admin?view=dormitory`);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("view=dormitory")) await page.goto(`${base}/admin?view=dormitory`);
  await page.locator('[data-dorm-room="A-104"]').waitFor({ timeout: 30_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.match(await page.locator("[data-dorm-allocations]").innerText(), /أماكن مشغولة/);
  assert.equal(await page.getByRole("button", { name: "التسكين" }).count(), 1);
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await shot(page, "dorm-occupancy-ar-390");
  await page.close();
});
