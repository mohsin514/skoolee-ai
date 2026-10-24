import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-437 on the isolated app with synthetic data: route and fleet rules (capacity, campus, active); a
// published trip freezes its manifest and later edits are recorded amendments; crews see only their trip; a
// child is on board one trip at a time and a second boarding opens an owned exception; events carry actor,
// student, trip and the time they happened, and an offline replay changes nothing; handover needs a verified
// recipient; normal closure reconciles and needs a signed empty-vehicle check; emergency closure leaves owned
// exceptions; families see only their child's status today.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.TRANSPORT_TEST_APP || "http://localhost:3107";
const evidence = process.env.TRANSPORT_EVIDENCE_DIR || "/tmp/sko437-evidence";
const db = new PrismaClient(), password = "SyntheticBus437!";
const schoolId = `bus437-${randomUUID()}`, north = randomUUID(), south = randomUUID(), classId = randomUUID();
const TZ = "Asia/Karachi";
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

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
const call = async (key: string, method: "post" | "get" | "patch", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const body = await r.text(); await ctx.close(); let json: { data?: any; error?: string; code?: string } = {}; try { json = JSON.parse(body); } catch { /* */ } return { status: r.status(), json, body }; };
const trips = (key: string, data: Record<string, unknown>) => call(key, "post", "/api/transport/trips", data);
const riders = (key: string, data: Record<string, unknown>) => call(key, "post", "/api/transport/riders", data);
const crew = (key: string, tripId: string, data: Record<string, unknown>) => trips(key, { tripId, clientEventId: randomUUID(), occurredAt: new Date().toISOString(), ...data });
const id = (key: string) => users.get(key)!.id;
const student = async (key: string, name: string, campus = north) => { ids[key] = randomUUID(); await db.student.create({ data: { id: ids[key], schoolId, campusId: campus, classId: campus === north ? classId : ids.southClass, fullName: name, rollNo: String(500 + Object.keys(ids).length), gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never }); };
const relate = async (guardianKey: string, studentKey: string, attendance = true) => {
  const rel = await db.guardianRelationship.create({ data: { schoolId, campusId: north, studentId: ids[studentKey], guardianUserId: id(guardianKey), createdByUserId: id("campusAdmin"), fullName: `Synthetic ${guardianKey}`, email: users.get(guardianKey)!.email, relationship: "Mother", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: id("campusAdmin"), reason: "Synthetic transport fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance, finances: false, communication: true, pickup: true } } });
};
const trip = (key: string, tripId: string) => call(key, "get", `/api/transport/trips?id=${tripId}`);
const status = async (tripId: string, studentKey: string) => (await db.tripPassenger.findFirstOrThrow({ where: { tripId, studentId: ids[studentKey] } })).status;

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Transport School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", timezone: TZ } as never });
  for (const [cid, name] of [[north, "Cedar North"], [south, "Cedar South"]]) { await db.campus.create({ data: { id: cid, schoolId, name, regId: cid, city: "Lahore" } }); await db.academicCycle.create({ data: { schoolId, campusId: cid, label: "2026", academicYear: 2026, status: "ACTIVE" } }); }
  await user("campusAdmin", "CAMPUS_ADMIN"); // role-ux §7.6: campus operations (the principal is academic and holds none of this) await user("attendant", "RECEPTIONIST"); await user("attendant2", "LIBRARIAN"); await user("teacher", "TEACHER"); await user("southAdmin", "CAMPUS_ADMIN", south);
  await user("attendant-ar", "RECEPTIONIST", north, "ar"); await user("mother", "PARENT"); await user("noAttendance", "PARENT"); await user("otherParent", "PARENT");
  await db.class.create({ data: { id: classId, schoolId, campusId: north, name: "Grade 3", section: "C", academicYear: 2026 } });
  ids.southClass = randomUUID(); await db.class.create({ data: { id: ids.southClass, schoolId, campusId: south, name: "Grade 3", section: "S", academicYear: 2026 } });
  for (const [k, n] of [["aisha", "Synthetic Aisha Khan"], ["bilal", "Synthetic Bilal Khan"], ["chen", "Synthetic Chen Li"], ["dana", "Synthetic Dana Noor"], ["emil", "Synthetic Emil Shah"], ["farah", "Synthetic Farah Ali"]] as const) await student(k, n);
  await student("southKid", "Synthetic South Pupil", south);
  await relate("mother", "aisha"); await relate("noAttendance", "aisha", false); await relate("otherParent", "bilal");
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("routes, fleet and riders: capacity and campus are enforced and a refused change leaves the route as it was", async () => {
  assert.equal((await call("campusAdmin", "post", "/api/transport/vehicles", { number: "BUS-00", capacity: 0 })).status, 400, "capacity must be 1–200");
  const bus = await call("campusAdmin", "post", "/api/transport/vehicles", { number: "BUS-04", model: "BUS", capacity: 3, driverName: "Synthetic Driver", driverPhone: "03001234567" });
  assert.equal(bus.status, 200, bus.body); ids.bus = bus.json.data.id;
  ids.van = (await call("campusAdmin", "post", "/api/transport/vehicles", { number: "VAN-02", model: "VAN", capacity: 8 })).json.data.id;
  ids.southVan = (await call("southAdmin", "post", "/api/transport/vehicles", { number: "VAN-S1", capacity: 8 })).json.data.id;
  ids.route = (await call("campusAdmin", "post", "/api/transport/routes", { title: "North Loop", fare: 0 })).json.data.id;
  ids.route2 = (await call("campusAdmin", "post", "/api/transport/routes", { title: "East Loop", fare: 0 })).json.data.id;
  assert.equal((await riders("teacher", { action: "assign", routeId: ids.route, studentId: ids.aisha })).status, 403, "coordinators only");
  assert.equal((await riders("campusAdmin", { action: "assign", routeId: ids.route, studentId: ids.aisha })).status, 409, "a vehicle with seats first");
  const cross = await call("campusAdmin", "patch", "/api/transport/routes", { id: ids.route, vehicleIds: [ids.bus, ids.southVan] });
  assert.equal(cross.status, 400, "another campus's vehicle is refused");
  assert.equal(await db.routeVehicle.count({ where: { routeId: ids.route } }), 0, "the route is unchanged");
  assert.equal((await riders("campusAdmin", { action: "vehicles", routeId: ids.route, vehicleIds: [ids.bus] })).status, 200);
  assert.equal((await riders("campusAdmin", { action: "vehicles", routeId: ids.route2, vehicleIds: [ids.van] })).status, 200);
  const stop = await riders("campusAdmin", { action: "stop", routeId: ids.route, name: "Canal Gate", sequence: 1 });
  assert.equal(stop.status, 201); ids.stop = stop.json.data.id;
  assert.equal((await riders("campusAdmin", { action: "stop", routeId: ids.route, name: "Canal Gate", sequence: 2 })).status, 409);
  // Another campus's pupil is either invisible (campus scoping) or refused as cross-campus — never assigned.
  assert.ok([400, 404].includes((await riders("campusAdmin", { action: "assign", routeId: ids.route, studentId: ids.southKid })).status), "cross-campus rider is refused");
  assert.equal((await db.student.findUniqueOrThrow({ where: { id: ids.southKid } })).transportRouteId, null);
  for (const k of ["aisha", "bilal", "chen"]) assert.equal((await riders("campusAdmin", { action: "assign", routeId: ids.route, studentId: ids[k], stopId: ids.stop })).status, 200);
  const full = await riders("campusAdmin", { action: "assign", routeId: ids.route, studentId: ids.dana });
  assert.equal(full.status, 409); assert.match(full.json.error ?? "", /full \(3 of 3 seats\)/);
  assert.equal((await call("campusAdmin", "patch", "/api/transport/vehicles", { id: ids.bus, capacity: 2 })).status, 409, "cannot shrink below the riders");
  assert.equal((await call("campusAdmin", "patch", "/api/transport/vehicles", { id: ids.bus, active: false })).status, 409, "cannot deactivate the only vehicle of a full route");
  assert.equal((await call("campusAdmin", "patch", "/api/transport/vehicles", { id: ids.bus, capacity: -4 })).status, 400);
  assert.equal((await db.vehicle.findUniqueOrThrow({ where: { id: ids.bus } })).capacity, 3);
  for (const k of ["dana", "emil"]) assert.equal((await riders("campusAdmin", { action: "assign", routeId: ids.route2, studentId: ids[k] })).status, 200);
  const detail = await call("campusAdmin", "get", `/api/transport/riders?routeId=${ids.route}`);
  assert.deepEqual([detail.json.data.seats, detail.json.data.riders.length, detail.json.data.riders[0].stopId], [3, 3, ids.stop]);
});

test("publishing freezes the manifest; route and fleet edits afterwards do not rewrite it; amendments are recorded", async () => {
  assert.equal((await trips("campusAdmin", { action: "publish", routeId: ids.route, vehicleId: ids.bus, direction: "PM", serviceDate: "2020-01-01", attendantId: id("attendant") })).status, 400, "no past days");
  assert.equal((await trips("campusAdmin", { action: "publish", routeId: ids.route, vehicleId: ids.van, direction: "PM", serviceDate: today, attendantId: id("attendant") })).status, 400, "the vehicle must be on the route");
  assert.equal((await trips("campusAdmin", { action: "publish", routeId: ids.route, vehicleId: ids.bus, direction: "PM", serviceDate: today, attendantId: id("southAdmin") })).status, 400, "attendant from this campus");
  const pub = await trips("campusAdmin", { action: "publish", routeId: ids.route, vehicleId: ids.bus, direction: "PM", serviceDate: today, attendantId: id("attendant"), label: "North · PM-12" });
  assert.equal(pub.status, 201, pub.body); ids.t1 = pub.json.data.id;
  assert.equal(pub.json.data.expected, 3);
  assert.equal((await trips("campusAdmin", { action: "publish", routeId: ids.route, vehicleId: ids.bus, direction: "PM", serviceDate: today, attendantId: id("attendant") })).status, 409, "one trip per route, day and run");
  ids.t2 = (await trips("campusAdmin", { action: "publish", routeId: ids.route2, vehicleId: ids.van, direction: "PM", serviceDate: today, attendantId: id("attendant2"), label: "East · PM-07" })).json.data.id;
  // Edits after publication: the rider leaves the route and the bus is renamed — the trip keeps both.
  assert.equal((await riders("campusAdmin", { action: "unassign", studentId: ids.chen })).status, 200);
  assert.equal((await call("campusAdmin", "patch", "/api/transport/vehicles", { id: ids.bus, number: "BUS-04R" })).status, 200);
  const t = await trip("campusAdmin", ids.t1);
  assert.deepEqual([t.json.data.trip.vehicleNumber, t.json.data.passengers.map((p: { name: string }) => p.name).sort()], ["BUS-04", ["Synthetic Aisha Khan", "Synthetic Bilal Khan", "Synthetic Chen Li"]], "the published manifest is unchanged");
  assert.equal((await trips("attendant", { action: "amend", tripId: ids.t1, change: "add", studentId: ids.farah, reason: "x" })).status, 403, "crews cannot amend");
  assert.equal((await trips("campusAdmin", { action: "amend", tripId: ids.t1, change: "add", studentId: ids.farah, reason: "" })).status, 400, "a reason is required");
  const add = await trips("campusAdmin", { action: "amend", tripId: ids.t1, change: "add", studentId: ids.farah, reason: "Staying with grandmother this week" });
  assert.deepEqual([add.status, add.json.data.overflow], [200, true], "4 riders on 3 seats opens an exception");
  const overflow = await db.tripException.findFirstOrThrow({ where: { tripId: ids.t1, kind: "CAPACITY_OVERFLOW" } });
  assert.equal(overflow.ownerId, id("campusAdmin"), "the exception has an owner");
  assert.equal(await db.notification.count({ where: { userId: id("campusAdmin"), type: "TRANSPORT_EXCEPTION" } }), 0, "no self-notice for the actor");
  assert.equal((await trips("campusAdmin", { action: "amend", tripId: ids.t1, change: "remove", studentId: ids.farah, reason: "Grandmother collecting by car" })).status, 200);
  const removed = await db.tripPassenger.findFirstOrThrow({ where: { tripId: ids.t1, studentId: ids.farah } });
  assert.deepEqual([removed.status, removed.source], ["REMOVED", "AMENDMENT"], "the amendment row is kept, not deleted");
  assert.equal((await trips("campusAdmin", { action: "resolve", id: overflow.id, resolution: "Rider removed by amendment; 3 seats for 3" })).status, 200);
  assert.deepEqual((await db.tripEvent.findMany({ where: { tripId: ids.t1 }, orderBy: { recordedAt: "asc" } })).map(e => e.kind), ["PUBLISHED", "AMENDED_ADD", "AMENDED_REMOVE", "EXCEPTION_RESOLVED"]);
});

test("crews see only their own trip, with names, stops and status — nothing academic or clinical", async () => {
  assert.equal((await trip("attendant2", ids.t1)).status, 403);
  assert.match((await trip("attendant2", ids.t1)).json.error ?? "", /not assigned to your crew/);
  assert.equal((await trip("teacher", ids.t1)).status, 403);
  assert.equal((await trip("mother", ids.t1)).status, 403, "families cannot open a trip");
  const list = await call("attendant", "get", "/api/transport/trips");
  assert.deepEqual(list.json.data.trips.map((x: { id: string }) => x.id), [ids.t1], "only the assigned trip");
  const view = await trip("attendant", ids.t1);
  assert.equal(view.status, 200);
  assert.deepEqual(view.json.data.events, [], "crews do not get the coordinator's history");
  assert.ok(!/Grade 3|rollNo|"50\d"|grandmother|03001234567/i.test(view.body), "no class, roll number, amendment reason or phone");
  assert.equal((await call("attendant", "get", `/api/care?view=clinic&studentId=${ids.aisha}`)).status, 403, "no clinic records");
  assert.equal((await call("attendant", "get", `/api/transport/riders?routeId=${ids.route}`)).status, 403, "no route administration");
});

test("boarding: actor, student, trip and time; replays change nothing; one trip at a time with an owned exception", async () => {
  assert.equal((await crew("attendant", ids.t1, { action: "board", studentId: ids.dana })).status, 409, "not on this manifest");
  assert.equal((await crew("attendant", ids.t1, { action: "board", studentId: ids.aisha, occurredAt: new Date(Date.now() + 3_600_000).toISOString() })).status, 400, "no future times");
  const queuedAt = new Date(Date.now() - 10 * 60_000).toISOString(), clientEventId = randomUUID();
  const first = await trips("attendant", { action: "board", tripId: ids.t1, studentId: ids.aisha, occurredAt: queuedAt, clientEventId });
  assert.deepEqual([first.status, first.json.data.repeated], [200, false]);
  const replay = await trips("attendant", { action: "board", tripId: ids.t1, studentId: ids.aisha, occurredAt: queuedAt, clientEventId });
  assert.deepEqual([replay.status, replay.json.data.repeated], [200, true], "an offline replay is recognised");
  assert.equal((await crew("attendant", ids.t1, { action: "board", studentId: ids.aisha })).json.data.repeated, true, "boarding twice is one boarding");
  const p = await db.tripPassenger.findFirstOrThrow({ where: { tripId: ids.t1, studentId: ids.aisha } });
  assert.deepEqual([p.status, p.boardedById, p.boardedAt?.toISOString()], ["BOARDED", id("attendant"), queuedAt], "the device's time is kept");
  assert.equal(await db.tripEvent.count({ where: { tripId: ids.t1, kind: "BOARDED", studentId: ids.aisha } }), 1);
  // Aisha added to the East trip and boarded there while still on board North.
  assert.equal((await trips("campusAdmin", { action: "amend", tripId: ids.t2, change: "add", studentId: ids.aisha, reason: "Going to aunt's house today" })).status, 200);
  const second = await crew("attendant2", ids.t2, { action: "board", studentId: ids.aisha });
  assert.deepEqual([second.status, second.json.code], [409, "DOUBLE_BOARDING"]);
  assert.equal(await db.tripPassenger.count({ where: { studentId: ids.aisha, status: "BOARDED" } }), 1, "never on board two vehicles");
  const ex = await db.tripException.findFirstOrThrow({ where: { tripId: ids.t2, kind: "DOUBLE_BOARDING", studentId: ids.aisha } });
  assert.equal(ex.ownerId, id("campusAdmin"));
  assert.equal(await db.notification.count({ where: { userId: id("campusAdmin"), type: "TRANSPORT_EXCEPTION" } }), 1, "the owner is told");
  // The coordinator confirms she is on East: North's record is settled, then East boards.
  assert.equal((await trips("campusAdmin", { action: "resolve", id: ex.id, outcome: "RELEASE_OTHER_TRIP", resolution: "Called North attendant: Aisha got off before departure and walked to East bus" })).status, 200);
  assert.equal(await status(ids.t1, "aisha"), "TRANSFERRED");
  assert.equal((await crew("attendant2", ids.t2, { action: "board", studentId: ids.aisha })).status, 200);
  // Two vehicles boarding the same child at the same instant: exactly one wins.
  assert.equal((await trips("campusAdmin", { action: "amend", tripId: ids.t1, change: "add", studentId: ids.emil, reason: "Synthetic race check" })).status, 200);
  const [r1, r2] = await Promise.all([crew("attendant", ids.t1, { action: "board", studentId: ids.emil }), crew("attendant2", ids.t2, { action: "board", studentId: ids.emil })]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409], JSON.stringify([r1.json, r2.json]));
  assert.equal(await db.tripPassenger.count({ where: { studentId: ids.emil, status: "BOARDED" } }), 1);
});

test("handover needs a verified recipient; a missing recipient is an exception, never a handover", async () => {
  assert.equal((await crew("attendant", ids.t1, { action: "handover", studentId: ids.bilal, receiverType: "GUARDIAN", receiverUserId: id("otherParent"), identityChecked: true })).status, 409, "board first");
  assert.equal((await crew("attendant", ids.t1, { action: "board", studentId: ids.bilal })).status, 200);
  assert.equal((await crew("attendant", ids.t1, { action: "board", studentId: ids.chen })).status, 200);
  assert.equal((await crew("attendant", ids.t1, { action: "handover", studentId: ids.bilal, receiverType: "GUARDIAN", receiverUserId: id("otherParent") })).status, 400, "identity must be checked");
  assert.equal((await crew("attendant", ids.t1, { action: "handover", studentId: ids.bilal, receiverType: "GUARDIAN", receiverUserId: id("mother"), identityChecked: true })).status, 400, "not this child's guardian");
  const cid = randomUUID();
  const ok = await trips("attendant", { action: "handover", tripId: ids.t1, studentId: ids.bilal, receiverType: "GUARDIAN", receiverUserId: id("otherParent"), identityChecked: true, clientEventId: cid, occurredAt: new Date().toISOString() });
  assert.equal(ok.status, 200);
  assert.equal((await trips("attendant", { action: "handover", tripId: ids.t1, studentId: ids.bilal, receiverType: "GUARDIAN", receiverUserId: id("otherParent"), identityChecked: true, clientEventId: cid, occurredAt: new Date().toISOString() })).json.data.repeated, true);
  const b = await db.tripPassenger.findFirstOrThrow({ where: { tripId: ids.t1, studentId: ids.bilal } });
  assert.deepEqual([b.status, b.receiverType, b.receiverName, b.handedOverById], ["HANDED_OVER", "GUARDIAN", "Synthetic otherParent", id("attendant")]);
  const none = await crew("attendant", ids.t1, { action: "exception", kind: "MISSING_RECIPIENT", studentId: ids.chen, note: "No one at Canal Gate; called school office" });
  assert.equal(none.status, 201);
  assert.equal(await status(ids.t1, "chen"), "BOARDED", "still on board, not handed over");
  assert.equal((await crew("attendant", ids.t1, { action: "exception", kind: "UNLISTED_PASSENGER", note: "Older boy says he is Bilal's cousin" })).status, 201);
});

test("normal closure reconciles first and needs a signed empty-vehicle check; emergency closure leaves owned exceptions", async () => {
  const blocked = await trips("attendant", { action: "close", tripId: ids.t1 });
  assert.equal(blocked.status, 409); assert.match(blocked.json.error ?? "", /still need a handover/);
  assert.equal((await crew("attendant", ids.t1, { action: "vehicle-check", empty: true, signature: "Synthetic attendant" })).status, 409, "a student is still recorded on board");
  const t = (await trip("campusAdmin", ids.t1)).json.data;
  // Emil's race went to one vehicle or the other; either way two riders are unresolved here.
  const emilOnNorth = (await status(ids.t1, "emil")) === "BOARDED";
  assert.deepEqual([t.counts.unresolved, t.counts.handedOver], [2, 1], "Chen on board and Emil unresolved");
  assert.ok(t.counts.openExceptions >= 2, "missing recipient and unlisted passenger at least");
  for (const e of t.exceptions.filter((x: { status: string }) => x.status === "OPEN")) {
    const r = e.kind === "MISSING_RECIPIENT"
      ? await trips("campusAdmin", { action: "resolve", id: e.id, outcome: "HANDED_OVER_CONFIRMED", receiverName: "Synthetic Office Manager", resolution: "Returned to school; collected by office manager" })
      : await trips("campusAdmin", { action: "resolve", id: e.id, resolution: e.kind === "UNLISTED_PASSENGER" ? "Cousin not on roster; dropped back at school gate with staff" : "Confirmed on East bus" });
    assert.equal(r.status, 200, r.body);
  }
  if (emilOnNorth) assert.equal((await crew("attendant", ids.t1, { action: "handover", studentId: ids.emil, receiverType: "STAFF", receiverUserId: id("teacher") })).status, 200);
  else assert.equal((await crew("attendant", ids.t1, { action: "absent", studentId: ids.emil, reason: "Travelled on the East bus" })).status, 200);
  assert.equal((await crew("attendant", ids.t1, { action: "vehicle-check", empty: true, signature: "Someone Else" })).status, 400, "signed by the attendant");
  assert.equal((await crew("attendant", ids.t1, { action: "vehicle-check", empty: true, signature: "synthetic attendant" })).status, 200);
  const closed = await trips("attendant", { action: "close", tripId: ids.t1 });
  assert.equal(closed.status, 200, closed.body);
  assert.deepEqual(closed.json.data.counts, emilOnNorth ? { expected: 3, boarded: 3, handedOver: 3, absent: 0, onBoard: 0, unresolved: 0 } : { expected: 3, boarded: 2, handedOver: 2, absent: 1, onBoard: 0, unresolved: 0 }, "Aisha transferred and Farah removed are not counted; everyone else reconciled");
  assert.equal((await trips("attendant", { action: "close", tripId: ids.t1 })).json.data.repeated, true, "closing twice is one closure");
  assert.equal((await crew("attendant", ids.t1, { action: "board", studentId: ids.chen })).status, 409, "a closed trip takes no events");
  // East: one handed over… and Dana never seen. Emergency closure needs a reason and leaves exceptions.
  assert.equal((await crew("attendant2", ids.t2, { action: "handover", studentId: ids.aisha, receiverType: "GUARDIAN", receiverUserId: id("mother"), identityChecked: true })).status, 200);
  assert.equal((await trips("attendant2", { action: "emergency-close", tripId: ids.t2, reason: "x" })).status, 403, "coordinators only");
  assert.equal((await trips("campusAdmin", { action: "emergency-close", tripId: ids.t2, reason: "" })).status, 400);
  const em = await trips("campusAdmin", { action: "emergency-close", tripId: ids.t2, reason: "Vehicle breakdown on canal road; escalated to principal and police; pupils moved by staff car" });
  assert.equal(em.status, 200);
  const t2 = await db.transportTrip.findUniqueOrThrow({ where: { id: ids.t2 } });
  assert.equal(t2.status, "CLOSED_EMERGENCY");
  const open = await db.tripException.findMany({ where: { tripId: ids.t2, status: "OPEN", kind: { in: ["MISSING_CHILD", "MISSING_RECIPIENT"] } } });
  const unresolved = await db.tripPassenger.findMany({ where: { tripId: ids.t2, status: { in: ["EXPECTED", "BOARDED"] } } });
  assert.ok(unresolved.some(p => p.studentId === ids.dana));
  assert.deepEqual(open.map(e => e.studentId).sort(), unresolved.map(p => p.studentId).sort(), "every unresolved rider has an owned exception");
  assert.ok(open.every(e => e.ownerId === id("campusAdmin")));
});

test("families see only their own child's status today — no other riders, crew or phone", async () => {
  const fam = await call("mother", "get", `/api/family/transport?studentId=${ids.aisha}`);
  assert.equal(fam.status, 200);
  assert.deepEqual(fam.json.data.journeys.map((j: { label: string; status: string }) => [j.label, j.status]), [["East · PM-07", "HANDED_OVER"]], "the updated journey only; the transferred North record is not shown");
  assert.ok(!/Bilal|Chen|Dana|Emil|attendant|Driver|0300/.test(fam.body), "nothing about other riders or the crew");
  assert.equal((await call("mother", "get", `/api/family/transport?studentId=${ids.bilal}`)).status, 404, "not her child");
  assert.equal((await call("noAttendance", "get", `/api/family/transport?studentId=${ids.aisha}`)).status, 404, "needs the attendance permission");
  assert.equal((await call("teacher", "get", `/api/family/transport?studentId=${ids.aisha}`)).status, 403);
});

test("screens: coordinator planner, crew manifest, handover, offline queue and replay, closure, phone, Arabic", async () => {
  // A fresh morning trip on North for the crew screens.
  for (const k of ["chen", "farah"]) await riders("campusAdmin", { action: "assign", routeId: ids.route, studentId: ids[k], stopId: ids.stop });
  ids.t3 = (await trips("campusAdmin", { action: "publish", routeId: ids.route, vehicleId: ids.bus, direction: "AM", serviceDate: today, attendantId: id("attendant"), label: "North · AM-03" })).json.data.id;
  const coord = await (await context("campusAdmin")).newPage();
  await coord.goto(`${base}/admin?view=transport`); // role-ux M54: transport lives in the campus console, not the Academic console
  await coord.locator('[data-transport-tab="riders"]').click();
  await coord.locator("[data-route-riders]").waitFor();
  await shot(coord, "01-coordinator-riders");
  await coord.locator('[data-transport-tab="trips"]').click();
  await coord.locator('[data-trip-row="North · AM-03"]').click();
  await coord.locator(`[data-trip="${ids.t3}"]`).waitFor();
  await shot(coord, "02-coordinator-trip");
  await coord.close();
  const ctx = await context("attendant", { width: 390, height: 844 });
  const a = await ctx.newPage();
  await a.goto(`${base}/transport`);
  await a.locator('[data-trip-row="North · AM-03"]').click();
  await a.locator(`[data-trip="${ids.t3}"]`).waitFor();
  assert.equal(await a.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no sideways scroll at phone width");
  await shot(a, "03-crew-manifest-phone");
  // Offline: boarding waits on the device, then replays once.
  await ctx.setOffline(true);
  await a.locator(`[data-passenger="${ids.chen}"] [data-board]`).click();
  await a.locator("[data-trip-pending]").waitFor();
  await shot(a, "04-offline-pending");
  assert.equal(await status(ids.t3, "chen"), "EXPECTED", "nothing claimed before the server confirms");
  await ctx.setOffline(false);
  // The browser may need a moment to report the connection back; the queue stays until the server confirms.
  for (let i = 0; i < 5 && !(await a.locator(`[data-passenger="${ids.chen}"][data-passenger-status=BOARDED]`).count()); i++) {
    if (await a.locator("[data-trip-flush]").count()) await a.locator("[data-trip-flush]").click();
    await a.waitForTimeout(800);
  }
  await a.locator(`[data-passenger="${ids.chen}"][data-passenger-status=BOARDED]`).waitFor();
  assert.equal(await db.tripEvent.count({ where: { tripId: ids.t3, kind: "BOARDED", studentId: ids.chen } }), 1);
  await a.locator(`[data-passenger="${ids.chen}"] [data-handover]`).click();
  await a.locator("[data-handover-form]").waitFor();
  await a.locator("[data-handover-who] option").nth(1).waitFor({ state: "attached" });
  await shot(a, "05-handover");
  await a.locator("[data-handover-who]").selectOption(id("teacher"));
  await a.locator("[data-handover-save]").click();
  await a.locator(`[data-passenger="${ids.chen}"][data-passenger-status=HANDED_OVER]`).waitFor();
  await a.locator("[data-close-blocked]").waitFor();
  await a.locator("[data-trip-close]").scrollIntoViewIfNeeded();
  await shot(a, "06-closure-blocked");
  await a.close(); await ctx.close();
  const ar = await (await context("attendant-ar")).newPage();
  await db.transportTrip.update({ where: { id: ids.t3 }, data: { attendantId: id("attendant-ar") } });
  await ar.goto(`${base}/transport`);
  await ar.locator("[data-trip-desk]").waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await ar.locator("[data-trip-row]").first().click();
  await ar.locator(`[data-trip="${ids.t3}"]`).waitFor();
  await shot(ar, "07-crew-ar");
  await ar.close();
  const empty = await (await context("teacher")).newPage();
  await empty.goto(`${base}/transport`);
  await empty.locator("[data-trip-empty]").waitFor();
  await shot(empty, "08-no-trip");
  await empty.close();
  const fam = await (await context("mother")).newPage();
  await fam.goto(`${base}/parent/attendance`);
  await fam.locator("[data-family-journey]").waitFor();
  await fam.locator("[data-family-journey]").scrollIntoViewIfNeeded();
  await shot(fam, "09-family-journey");
  await fam.close();
});
