import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { sendTemplatedCommunication } from "../../src/lib/notifications/service";
import { getLocalePackage } from "../../src/lib/locale/store";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
const url = process.env.DATABASE_URL || "";
if (!url.includes("127.0.0.1:55401/sko201")) throw new Error("Local SKO-201 database required");
const db = new PrismaClient();
test("persisted policy resolves exact effective boundaries, inheritance, finance gate and tenant isolation", async () => {
 const schoolId = "locale-db-regression";
 try {
 await db.school.create({ data: { id: schoolId, name: "Local regression", slug: schoolId, city: "Local", regId: schoolId, contactEmail: `${schoolId}@example.invalid`, timezone: "America/New_York" } });
 await db.campus.create({ data: { id: `${schoolId}-a`, schoolId, name: "A", city: "Local", regId: `${schoolId}-a` } });
 await db.weekend.createMany({ data: [6, 7].map((dayOfWeek) => ({ schoolId, campusId: `${schoolId}-a`, dayOfWeek })) });
 await db.localePolicy.createMany({ data: [
 { id: `${schoolId}-p1`, schoolId, scopeKey: "school", settings: { timezone: "Europe/London", language: "ar", weekend: [5, 6] }, effectiveAt: new Date("2027-04-01T00:00:00Z"), createdBy: "fixture" },
 { id: `${schoolId}-p2`, schoolId, campusId: `${schoolId}-a`, scopeKey: `${schoolId}-a`, settings: { language: "en" }, effectiveAt: new Date("2027-04-02T00:00:00Z"), createdBy: "fixture" },
 { id: `${schoolId}-p3`, schoolId, scopeKey: "school", settings: { currency: "KWD" }, effectiveAt: new Date("2027-04-03T00:00:00Z"), createdBy: "fixture", status: "FINANCE_REVIEW" },
 ] });
 await runWithTenantContext({ schoolId }, async () => {
  assert.equal((await getLocalePackage(schoolId, null, new Date("2027-03-31T23:59:59.999Z"))).timezone, "America/New_York");
  assert.equal((await getLocalePackage(schoolId, null, new Date("2027-04-01T00:00:00Z"))).timezone, "Europe/London");
  assert.deepEqual((await getLocalePackage(schoolId, `${schoolId}-a`, new Date("2027-03-31T23:59:59Z"))).weekend, [6, 0]);
  assert.deepEqual((await getLocalePackage(schoolId, `${schoolId}-a`, new Date("2027-04-01T00:00:00Z"))).weekend, [5, 6]);
  const campus = await getLocalePackage(schoolId, `${schoolId}-a`, new Date("2027-04-02T00:00:00Z")); assert.equal(campus.language, "en"); assert.equal(campus.timezone, "Europe/London");
  assert.equal((await getLocalePackage(schoolId, null, new Date("2027-04-04T00:00:00Z"))).currency, "PKR");
  const foreign = await prisma.localePolicy.findMany({ where: { id: "locale-foreign-nonexistent" } }); assert.deepEqual(foreign, []);
  await assert.rejects(() => prisma.localePolicy.findMany({ where: { schoolId: "locale-fixture" } }));
 });
 await db.localePolicy.create({ data: { id: `${schoolId}-notify`, schoolId, scopeKey: "school", settings: { language: "ar" }, effectiveAt: new Date("2020-01-01T00:00:00Z"), createdBy: "fixture" } });
 await runWithTenantContext({ schoolId }, async () => {
   const message = await sendTemplatedCommunication({ key: "GENERAL_ANNOUNCEMENT", channel: "EMAIL", target: { schoolId }, context: { parentName: "أحمد", announcementTitle: "TEST-014", announcementBody: "اختبار محلي", schoolName: "مدرسة" }, approvedData: true });
   assert.equal(message.status, "NO_RECIPIENT"); assert.match(message.body, /عزيزي أحمد/); assert.match(message.subject || "", /TEST-014/); assert.equal((message.metadata as { localeSnapshot: { language: string } }).localeSnapshot.language, "ar");
 });
 assert.equal((await db.school.findUniqueOrThrow({ where: { id: schoolId } })).timezone, "America/New_York");
 } finally { await db.school.deleteMany({ where: { id: schoolId } }); await db.$disconnect(); await prisma.$disconnect(); }
});
