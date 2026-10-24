import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { request as playwrightRequest, type APIRequestContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-389 secondary entities through their real API routes on the isolated app: configuration and
// reference records still used by history are refused with an explanation; unused ones delete.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DELETION_TEST_APP || "http://localhost:3107";
const db = new PrismaClient(), password = "SyntheticGuards389!";
const schoolId = `grd389-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), studentId = randomUUID(), email = `${randomUUID()}@example.invalid`;
let api: APIRequestContext;

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Willowmere School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Sialkot", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Willowmere Main", regId: campusId, city: "Sialkot" } });
  await db.user.create({ data: { email, password: await bcrypt.hash(password, 12), fullName: "Synthetic manager", role: "CAMPUS_ADMIN", schoolId, campusId, isActive: true, onboardingComplete: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "One", academicYear: 2026 } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic Guard Pupil", rollNo: "G-1", gender: "MALE", enrollmentDate: new Date("2026-04-01Z") } });
  await db.authAttempt.deleteMany({});
  api = await playwrightRequest.newContext({ baseURL: base });
  assert.equal((await api.post("/api/auth/login", { data: { email, password } })).status(), 200);
  const { secret } = await (await api.post("/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await api.post("/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await api.post("/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
});
after(async () => { await api?.dispose(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("a fee type or group still priced in master lines is refused; an unused one deletes", async () => {
  const group = await db.feeGroup.create({ data: { schoolId, campusId, name: "Synthetic Tuition" } });
  const used = await db.feeType.create({ data: { schoolId, campusId, name: "Synthetic Monthly", code: `M-${randomUUID().slice(0, 6)}` } });
  const unused = await db.feeType.create({ data: { schoolId, campusId, name: "Synthetic Unused", code: `U-${randomUUID().slice(0, 6)}` } });
  await db.feesMasterLine.create({ data: { schoolId, campusId, feeGroupId: group.id, feeTypeId: used.id, amount: 5000 } });
  const refusedType = await api.delete(`/api/fees/types?id=${used.id}`);
  assert.equal(refusedType.status(), 409);
  assert.match((await refusedType.json()).error, /used by 1 master line/);
  assert.equal((await api.delete(`/api/fees/groups?id=${group.id}`)).status(), 409);
  assert.equal(await db.feesMasterLine.count({ where: { feeGroupId: group.id } }), 1, "nothing cascaded");
  assert.equal((await api.delete(`/api/fees/types?id=${unused.id}`)).status(), 200);
});

test("an assigned discount and an applied or credit carry-forward are refused", async () => {
  const discount = await db.feeDiscount.create({ data: { schoolId, campusId, name: "Synthetic Sibling", code: `S-${randomUUID().slice(0, 6)}`, type: "PERCENT", value: 10 } });
  await db.feeDiscountAssignment.create({ data: { schoolId, discountId: discount.id, studentId } });
  assert.equal((await api.delete(`/api/fees/discounts?id=${discount.id}`)).status(), 409);
  assert.equal(await db.feeDiscountAssignment.count({ where: { discountId: discount.id } }), 1);
  const credit = await db.feeCarryForward.create({ data: { schoolId, campusId, studentId, fromAcademicYear: 2025, toAcademicYear: 2026, balance: -2500, note: "Auto credit from overpayment" } });
  const refused = await api.delete(`/api/fees/carry-forwards?id=${credit.id}`);
  assert.equal(refused.status(), 409);
  assert.match((await refused.json()).error, /finance correction/);
  assert.ok(await db.feeCarryForward.findUnique({ where: { id: credit.id } }));
});

test("a supplier that appears on stock history is refused; an unused supplier deletes", async () => {
  const store = await db.itemStore.create({ data: { schoolId, campusId, name: "Synthetic Store" } });
  const item = await db.item.create({ data: { schoolId, campusId, name: "Synthetic Chalk" } });
  const used = await db.supplier.create({ data: { schoolId, campusId, name: "Synthetic Supplies Co" } });
  const unused = await db.supplier.create({ data: { schoolId, campusId, name: "Synthetic Unused Co" } });
  await db.itemTransaction.create({ data: { schoolId, campusId, itemId: item.id, storeId: store.id, kind: "RECEIVE", quantity: 10, supplierId: used.id } });
  assert.equal((await api.delete(`/api/inventory/suppliers?id=${used.id}`)).status(), 409);
  assert.equal((await db.itemTransaction.findFirstOrThrow({ where: { itemId: item.id } })).supplierId, used.id, "stock history keeps its supplier");
  assert.equal((await api.delete(`/api/inventory/suppliers?id=${unused.id}`)).status(), 200);
});
