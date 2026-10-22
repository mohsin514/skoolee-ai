import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { addMenuItem, approveLeave, boardingOverview, canteenOverview, decideOrder, dietaryRecords, disablePackage, enablePackage, familyCanteen, leaveHandover, packageStates, placeOrder, reconcile, recordDietary, resolveException, reviewDietary, setSpendLimit, setupPackage, takeRollCall } from "../../src/lib/campus-packages/service";

// SKO-456: packages stay off until named operators and a completed checklist; canteen orders are
// capacity-safe, limited and idempotent with one charge and one refund each; dietary data is
// restricted and uncertain cases wait for trained staff; boarding leave and roll calls produce
// exceptions; disabling stops new transactions and archiving needs every obligation closed.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), schoolId = `pkg-${randomUUID()}`, campusId = randomUUID(), otherCampus = randomUUID();
const actor = (role: AuthUser["role"], campus = campusId): AuthUser => ({ userId: randomUUID(), schoolId, campusId: campus, role, email: `${randomUUID()}@example.invalid` });
const opsLead = actor("CAMPUS_ADMIN"), principal = actor("PRINCIPAL"), manager = actor("ACCOUNTANT"), dietLead = actor("TEACHER"), warden = actor("TEACHER"), approver = actor("CAMPUS_ADMIN"), parentA = actor("PARENT"), parentB = actor("PARENT"), otherPrincipal = actor("PRINCIPAL", otherCampus);
const ctx = <T>(u: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId, campusId: u.campusId, userId: u.userId, role: u.role }, work);
const ids: Record<string, string> = {};
const key = () => randomUUID().replace(/-/g, "");
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

async function guardian(parent: AuthUser, studentId: string) {
  const rel = await raw.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: parent.userId, createdByUserId: opsLead.userId, fullName: "Synthetic guardian", email: parent.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await raw.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: opsLead.userId, reason: "Synthetic fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false } } });
}

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic residential school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  for (const id of [campusId, otherCampus]) await raw.campus.create({ data: { id, schoolId, name: `Synthetic ${id.slice(0, 4)}`, regId: id, city: "Synthetic" } });
  for (const u of [opsLead, principal, manager, dietLead, warden, approver, parentA, parentB, otherPrincipal]) await raw.user.create({ data: { id: u.userId, schoolId, campusId: u.campusId, role: u.role, email: u.email, fullName: `Synthetic ${u.role} ${u.userId.slice(0, 4)}`, onboardingComplete: true, isActive: true } });
  const classId = randomUUID();
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "A", academicYear: 2026 } });
  for (const [k, name] of [["amal", "Synthetic Amal"], ["badr", "Synthetic Badr"], ["dana", "Synthetic Dana"]]) ids[k] = (await raw.student.create({ data: { schoolId, campusId, classId, fullName: name, rollNo: k, gender: "FEMALE", status: "active" } })).id;
  await guardian(parentA, ids.amal); await guardian(parentB, ids.badr);
  const type = await raw.dormRoomType.create({ data: { schoolId, campusId, name: "Standard" } });
  const room = await raw.dormRoom.create({ data: { schoolId, campusId, roomTypeId: type.id, number: "C-1", capacity: 4 } });
  for (const s of ["amal", "badr", "dana"]) await raw.dormAllocation.create({ data: { schoolId, campusId, roomId: room.id, studentId: ids[s], startDate: new Date("2026-01-01T00:00:00Z"), reason: "Synthetic boarder", createdById: opsLead.userId } });
});
after(async () => {
  for (const m of [raw.boardingRollCall, raw.boardingLeave, raw.dietaryRecord, raw.canteenSpendLimit, raw.canteenLedgerEntry, raw.canteenOrder, raw.canteenItem, raw.campusPackage, raw.dormAllocation]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect();
});

test("a package needs named operators and a completed checklist; it stays off elsewhere", async () => {
  assert.deepEqual(await ctx(opsLead, () => packageStates(opsLead)), {}, "no package adds anything until set up");
  await assert.rejects(() => ctx(warden, () => setupPackage(warden, { package: "BOARDING" })), { status: 403 });
  // §7.6: packages are campus operations; the principal no longer sets them up.
  await assert.rejects(() => ctx(principal, () => setupPackage(principal, { package: "BOARDING" })), { status: 403 });
  await ctx(opsLead, () => setupPackage(opsLead, { package: "BOARDING", operators: { WARDEN: [warden.userId] } }));
  await assert.rejects(() => ctx(opsLead, () => enablePackage(opsLead, { package: "BOARDING" })), /Assign a leave approver/);
  await assert.rejects(() => ctx(opsLead, () => setupPackage(opsLead, { package: "BOARDING", operators: { LEAVE_APPROVER: [otherPrincipal.userId] } })), /active staff at this campus/);
  await ctx(opsLead, () => setupPackage(opsLead, { package: "BOARDING", operators: { LEAVE_APPROVER: [approver.userId] } }));
  for (const item of ["missing_student_procedure", "leave_policy_validated", "roll_call_times", "night_supervision_rota"]) await ctx(opsLead, () => setupPackage(opsLead, { package: "BOARDING", check: { item, note: "Validated with the house team" } }));
  assert.equal((await ctx(opsLead, () => enablePackage(opsLead, { package: "BOARDING" }))).status, "ENABLED");
  await ctx(opsLead, () => setupPackage(opsLead, { package: "CANTEEN", operators: { MANAGER: [manager.userId], DIETARY_LEAD: [dietLead.userId] } }));
  for (const item of ["food_safety_procedure", "allergen_procedure_validated", "refund_policy", "menu_publishing_owner"]) await ctx(opsLead, () => setupPackage(opsLead, { package: "CANTEEN", check: { item, note: "Signed off by the operations lead" } }));
  await ctx(opsLead, () => enablePackage(opsLead, { package: "CANTEEN" }));
  assert.deepEqual(await ctx(opsLead, () => packageStates(opsLead)), { BOARDING: "ENABLED", CANTEEN: "ENABLED" });
  assert.deepEqual(await ctx(otherPrincipal, () => packageStates(otherPrincipal)), {}, "another campus is unchanged");
  await assert.rejects(() => ctx(opsLead, () => dietaryRecords(opsLead)), /dietary lead/, "package administration grants no dietary access");
});

test("orders check menu, capacity and limits; retries replay; the last meal sells once; charges reconcile", async () => {
  await assert.rejects(() => ctx(opsLead, () => addMenuItem(opsLead, { serviceDate: tomorrow(), name: "x", price: 1, currency: "SAR", capacity: 1, allergens: [] })), /canteen manager/);
  const lunch = await ctx(manager, () => addMenuItem(manager, { serviceDate: tomorrow(), name: "Chicken rice", price: 1500, currency: "SAR", capacity: 1, allergens: [] }));
  const order = { itemId: lunch.id, quantity: 1 };
  const [a, b] = await Promise.allSettled([ctx(parentA, () => placeOrder(parentA, { ...order, studentId: ids.amal, idempotencyKey: (ids.ka = key()) })), ctx(parentB, () => placeOrder(parentB, { ...order, studentId: ids.badr, idempotencyKey: key() }))]);
  assert.deepEqual([a.status, b.status].sort(), ["fulfilled", "rejected"], "the final meal sells once");
  assert.equal((await raw.canteenItem.findUniqueOrThrow({ where: { id: lunch.id } })).sold, 1);
  const winner = a.status === "fulfilled" ? { parent: parentA, student: ids.amal, key: ids.ka } : null;
  if (winner) {
    const retry = await ctx(winner.parent, () => placeOrder(winner.parent, { ...order, studentId: winner.student, idempotencyKey: winner.key }));
    assert.equal(retry.replayed, true, "a retry after a timeout replays the first order");
  }
  assert.equal(await raw.canteenLedgerEntry.count({ where: { schoolId, kind: "CHARGE" } }), 1, "one charge");
  await assert.rejects(() => ctx(parentA, () => placeOrder(parentA, { ...order, studentId: ids.badr, idempotencyKey: key() })), { status: 404 }, "only the child's own guardian orders");
  const soup = await ctx(manager, () => addMenuItem(manager, { serviceDate: tomorrow(), name: "Lentil soup", price: 800, currency: "SAR", capacity: 50, allergens: [] }));
  const already = a.status === "fulfilled" ? 0 : 1500; // the lunch went to whichever guardian won the race
  await ctx(parentB, () => setSpendLimit(parentB, { studentId: ids.badr, dailyLimit: already + 1000 }));
  await ctx(parentB, () => placeOrder(parentB, { itemId: soup.id, quantity: 1, studentId: ids.badr, idempotencyKey: key() }));
  await assert.rejects(() => ctx(parentB, () => placeOrder(parentB, { itemId: soup.id, quantity: 1, studentId: ids.badr, idempotencyKey: key() })), new RegExp(`daily limit of ${already + 1000} SAR \\(already ${already + 800}\\)`));
  const placed = await raw.canteenOrder.findFirstOrThrow({ where: { studentId: ids.badr, itemId: soup.id } });
  await ctx(parentB, () => decideOrder(parentB, placed.id, { action: "CANCEL" }));
  await assert.rejects(() => ctx(parentB, () => decideOrder(parentB, placed.id, { action: "CANCEL" })), { status: 409 }, "no second refund");
  const rec = await ctx(opsLead, () => reconcile(schoolId, campusId));
  assert.deepEqual([rec.mismatches.length, rec.refunded], [0, 800]);
});

test("dietary records are restricted, show source and date, and uncertain cases wait for trained staff", async () => {
  await ctx(parentA, () => recordDietary(parentA, { studentId: ids.amal, allergens: ["Peanut"], source: "GUARDIAN", sourceDate: "2026-09-01" }));
  const satay = await ctx(manager, () => addMenuItem(manager, { serviceDate: tomorrow(), name: "Satay noodles", price: 1200, currency: "SAR", capacity: 20, allergens: ["peanut", "soy"] }));
  const pasta = await ctx(manager, () => addMenuItem(manager, { serviceDate: tomorrow(), name: "Pasta", price: 900, currency: "SAR", capacity: 20, allergens: ["gluten"] }));
  const held = await ctx(parentA, () => placeOrder(parentA, { itemId: satay.id, quantity: 1, studentId: ids.amal, idempotencyKey: key() }));
  assert.deepEqual([held.order.status, held.order.holdReason], ["HOLD", "Declared allergen: peanut. A trained staff member will check this order."]);
  const unconfirmed = await ctx(parentA, () => placeOrder(parentA, { itemId: pasta.id, quantity: 1, studentId: ids.amal, idempotencyKey: key() }));
  assert.equal(unconfirmed.order.status, "HOLD", "an unconfirmed record holds any allergen meal");
  assert.equal(await raw.canteenLedgerEntry.count({ where: { orderId: { in: [held.order.id, unconfirmed.order.id] } } }), 0, "held orders are not charged");
  const managerView = await ctx(manager, () => canteenOverview(manager));
  assert.equal(managerView.dietary, null, "the manager does not see dietary records");
  assert.ok(managerView.orders.filter((o) => o.status === "HOLD").every((o) => o.holdReason === "Waiting for the dietary lead"), "nor the allergen behind a hold");
  const records = await ctx(dietLead, () => dietaryRecords(dietLead));
  assert.deepEqual([records[0].source, records[0].sourceDate.toISOString().slice(0, 10), records[0].status], ["GUARDIAN", "2026-09-01", "NEEDS_CONFIRMATION"]);
  await ctx(dietLead, () => reviewDietary(dietLead, records[0].id, { status: "CONFIRMED", note: "Confirmed with guardian by phone" }));
  await assert.rejects(() => ctx(dietLead, () => decideOrder(dietLead, held.order.id, { action: "REJECT" })), /Record what was checked/);
  await ctx(dietLead, () => decideOrder(dietLead, held.order.id, { action: "REJECT", note: "Peanut allergy confirmed; offered the pasta" }));
  await ctx(dietLead, () => decideOrder(dietLead, unconfirmed.order.id, { action: "RELEASE", note: "Gluten is not on the confirmed record" }));
  assert.deepEqual((await raw.canteenLedgerEntry.findMany({ where: { orderId: { in: [held.order.id, unconfirmed.order.id] } } })).map((e) => [e.orderId === unconfirmed.order.id, e.kind]), [[true, "CHARGE"]]);
  assert.equal((await ctx(opsLead, () => reconcile(schoolId, campusId))).mismatches.length, 0);
  const family = await ctx(parentA, () => familyCanteen(parentA));
  assert.equal(family.children[0].dietary?.status, "CONFIRMED", "the guardian sees the record and its status");
});

test("boarding leave is approved and handed over; roll call flags missing and overdue boarders", async () => {
  await assert.rejects(() => ctx(warden, () => approveLeave(warden, { studentId: ids.badr, departAt: new Date().toISOString(), expectedReturnAt: new Date(Date.now() + 3_600_000).toISOString(), destination: "Home", collectedBy: "Guardian" })), /leave approver/);
  const leave = await ctx(approver, () => approveLeave(approver, { studentId: ids.badr, departAt: new Date(Date.now() - 7_200_000).toISOString(), expectedReturnAt: new Date(Date.now() - 3_600_000).toISOString(), destination: "Family visit", collectedBy: "Synthetic uncle (ID checked)" }));
  await ctx(warden, () => leaveHandover(warden, leave.id, { step: "DEPART" }));
  const roll = await ctx(warden, () => takeRollCall(warden, { label: "20:00", present: [ids.amal] }));
  assert.deepEqual((roll.exceptions as { studentId: string; kind: string }[]).map((e) => [e.studentId === ids.dana ? "dana" : "badr", e.kind]).sort(), [["badr", "LEAVE_OVERDUE"], ["dana", "MISSING"]]);
  const view = await ctx(warden, () => boardingOverview(warden));
  assert.equal(view.leave.find((l) => l.id === leave.id)?.overdue, true);
  await assert.rejects(() => ctx(warden, () => leaveHandover(warden, leave.id, { step: "RETURN", returnedTo: "Synthetic uncle" })), /late. Record the reason/);
  await ctx(warden, () => leaveHandover(warden, leave.id, { step: "RETURN", returnedTo: "Synthetic uncle", lateReason: "Traffic; guardian phoned ahead" }));
  await ctx(warden, () => resolveException(warden, roll.id, { studentId: ids.badr, resolution: "Returned late with uncle; reason recorded" }));
  ids.roll = roll.id;
});

test("disabling stops new transactions; archiving waits until every obligation is closed", async () => {
  const disabled = await ctx(opsLead, () => disablePackage(opsLead, { package: "BOARDING", reason: "Term ends; boarding paused" }));
  assert.deepEqual(disabled.obligations, ["1 roll-call exception(s) are unresolved."]);
  await assert.rejects(() => ctx(approver, () => approveLeave(approver, { studentId: ids.amal, departAt: new Date().toISOString(), expectedReturnAt: new Date(Date.now() + 3_600_000).toISOString(), destination: "Home", collectedBy: "Guardian" })), /Boarding is not enabled/);
  assert.equal((await ctx(warden, () => boardingOverview(warden))).rollCalls.length, 1, "history stays readable");
  await assert.rejects(() => ctx(opsLead, () => disablePackage(opsLead, { package: "BOARDING", archive: true, reason: "Closing boarding" })), /Close these before archiving: 1 roll-call exception/);
  await ctx(warden, () => resolveException(warden, ids.roll, { studentId: ids.dana, resolution: "Found in the library; school procedure followed" }));
  assert.equal((await ctx(opsLead, () => disablePackage(opsLead, { package: "BOARDING", archive: true, reason: "Closing boarding" }))).package.status, "ARCHIVED");
  await ctx(opsLead, () => disablePackage(opsLead, { package: "CANTEEN", reason: "Kitchen refit" }));
  const pastaId = (await raw.canteenItem.findFirstOrThrow({ where: { schoolId, name: "Pasta" } })).id;
  await assert.rejects(() => ctx(parentA, () => placeOrder(parentA, { itemId: pastaId, quantity: 1, studentId: ids.amal, idempotencyKey: key() })), /Canteen ordering is not enabled/);
  await assert.rejects(() => ctx(opsLead, () => disablePackage(opsLead, { package: "CANTEEN", archive: true, reason: "Kitchen closed" })), /meal order\(s\) for today or later are still open/);
});
