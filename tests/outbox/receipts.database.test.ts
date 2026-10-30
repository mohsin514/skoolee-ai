import { redis } from "../../src/lib/queue/connection";
import { after as disconnectRedisAfterTests } from "node:test";
// Notification services open a shared Redis socket; close it after this test process finishes.
disconnectRedisAfterTests(() => redis.disconnect());
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { POST } from "../../src/app/api/whatsapp/webhook/route";
import { prisma } from "../../src/lib/db/prisma";
import { outboxDestination } from "./local-destination.mjs";

outboxDestination();
const db = new PrismaClient();
const secret = "synthetic-sko382-signature-fixture-only";
const phoneId = "synthetic-sko382-phone";
const schoolId = `receipt-fixture-${randomUUID()}`;
const otherSchoolId = `receipt-fixture-${randomUUID()}`;
const nowSeconds = Math.floor(Date.now() / 1000);
const createdAt = new Date((nowSeconds - 60) * 1000 + 500);
const originalSecret = process.env.WHATSAPP_APP_SECRET;
const originalPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;
const providerId = `synthetic-provider-${randomUUID()}`;
let communicationId: string;

function body(statuses: unknown, number = phoneId) {
  return { entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: number }, statuses } }] }] };
}
function status(state: string, timestamp = nowSeconds - 10, id = providerId) {
  return { id, status: state, timestamp: String(timestamp) };
}
async function request(payload: unknown, signature?: string, rawOverride?: string) {
  const raw = rawOverride ?? JSON.stringify(payload);
  const signed = signature ?? `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  return POST(new NextRequest("http://localhost/api/whatsapp/webhook", {
    method: "POST", headers: { "x-hub-signature-256": signed, "Content-Type": "application/json" }, body: raw,
  }));
}
async function receipts() {
  return db.deliveryReceipt.findMany({ where: { communicationId }, orderBy: { occurredAt: "asc" } });
}
before(async () => {
  process.env.WHATSAPP_APP_SECRET = secret;
  process.env.WHATSAPP_PHONE_NUMBER_ID = phoneId;
  for (const id of [schoolId, otherSchoolId]) await db.school.create({ data: {
    id, name: "Synthetic receipt fixture", slug: id, city: "Synthetic", regId: id, contactEmail: `${id}@example.invalid`,
  } });
  communicationId = (await db.parentCommunication.create({ data: {
    schoolId, templateKey: "SYNTHETIC_RECEIPT", channel: "WHATSAPP", recipient: "+15550000000",
    body: "Synthetic receipt verification", status: "SENT", providerMessageId: providerId,
    createdAt, sentAt: new Date((nowSeconds - 5) * 1000),
  } })).id;
});
after(async () => {
  if (originalSecret === undefined) delete process.env.WHATSAPP_APP_SECRET; else process.env.WHATSAPP_APP_SECRET = originalSecret;
  if (originalPhone === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID; else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhone;
  await db.school.deleteMany({ where: { id: { in: [schoolId, otherSchoolId] } } });
  await db.$disconnect();
  await prisma.$disconnect();
});

test("actual webhook rejects invalid signatures, mutated bytes and unsigned bodies without mutations", async () => {
  const payload = body([status("sent")]);
  assert.equal((await request(payload, "sha256=" + "0".repeat(64))).status, 401);
  const raw = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  assert.equal((await request(payload, signature, raw + " ")).status, 401);
  assert.equal((await request(payload, "")).status, 401);
  assert.equal((await receipts()).length, 0);
});

test("signed out-of-order receipts are durable, duplicate-idempotent and preserve the originating intent", async () => {
  assert.equal((await request(body([status("read", nowSeconds - 8)]))).status, 200);
  assert.equal((await request(body([status("delivered", nowSeconds - 10)]))).status, 200);
  assert.equal((await request(body([status("read", nowSeconds - 8), status("delivered", nowSeconds - 10)]))).status, 200);
  const rows = await receipts();
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.state), ["delivered", "read"]);
  assert.ok(rows.every(row => row.schoolId === schoolId && row.providerMessageId === providerId));
  const source = await db.parentCommunication.findUniqueOrThrow({ where: { id: communicationId } });
  assert.equal(source.status, "SENT");
  assert.equal(source.body, "Synthetic receipt verification");
});

test("signed timestamp validation rejects pre-origin/future/malformed events and permits provider-second precision", async () => {
  const before = (await receipts()).length;
  assert.equal((await request(body([
    status("sent", nowSeconds - 61), status("failed", nowSeconds + 3600),
    { ...status("sent"), timestamp: "not-a-time" }, { ...status("sent"), timestamp: "9999999999999" },
    { ...status("sent"), timestamp: "-1" }, { ...status("sent"), status: "unknown" },
    { ...status("sent"), id: "x".repeat(513) }, null,
  ]))).status, 200);
  assert.equal((await receipts()).length, before, JSON.stringify((await receipts()).map(row => ({ state: row.state, occurredAt: row.occurredAt }))));
  // Provider timestamps have seconds; intent has milliseconds. Its first second is valid.
  assert.equal((await request(body([status("sent", nowSeconds - 60)]))).status, 200);
  assert.equal((await receipts()).length, before + 1);
});

test("wrong account/malformed envelope is ignored; unknown or unsent origin requests retry without mutations", async () => {
  const before = (await receipts()).length;
  assert.equal((await request(body([status("failed")], "other-account"))).status, 200);
  assert.equal((await request(body([status("failed", nowSeconds, "unknown-provider-message")]))).status, 500);
  for (const malformed of [null, { entry: {} }, { entry: [null, { changes: {} }] }, body({ id: providerId })]) {
    assert.equal((await request(malformed)).status, 200);
  }
  await db.parentCommunication.update({ where: { id: communicationId }, data: { sentAt: null } });
  try { assert.equal((await request(body([status("failed")]))).status, 500); }
  finally { await db.parentCommunication.update({ where: { id: communicationId }, data: { sentAt: new Date((nowSeconds - 5) * 1000) } }); }
  assert.equal((await receipts()).length, before);
});

test("ambiguous cross-tenant provider identity fails closed, then a unique origin accepts replay once", async () => {
  const before = (await receipts()).length;
  const collision = await db.parentCommunication.create({ data: {
    schoolId: otherSchoolId, templateKey: "SYNTHETIC_RECEIPT", channel: "WHATSAPP", recipient: "+15550000001",
    body: "Synthetic duplicate provider identity", status: "SENT", providerMessageId: providerId,
    createdAt, sentAt: new Date((nowSeconds - 5) * 1000),
  } });
  const payload = { ...body([status("failed", nowSeconds)]), schoolId: otherSchoolId, communicationId: collision.id };
  assert.equal((await request(payload)).status, 500);
  assert.equal((await receipts()).length, before);
  assert.equal(await db.deliveryReceipt.count({ where: { communicationId: collision.id } }), 0);
  await db.parentCommunication.delete({ where: { id: collision.id } });
  assert.equal((await request(payload)).status, 200);
  assert.equal((await request(payload)).status, 200);
  assert.equal((await receipts()).length, before + 1);
  assert.equal(await db.deliveryReceipt.count({ where: { schoolId: otherSchoolId } }), 0);
});

test("callback arriving before provider identity persistence is retried and stores exactly once after recovery", async () => {
  const identity = `synthetic-delayed-${randomUUID()}`;
  const payload = body([status("delivered", nowSeconds, identity)]);
  const before = await db.deliveryReceipt.count({ where: { schoolId } });
  assert.equal((await request(payload)).status, 500);
  assert.equal(await db.deliveryReceipt.count({ where: { schoolId } }), before);
  const origin = await db.parentCommunication.create({ data: {
    schoolId, templateKey: "SYNTHETIC_RECEIPT", channel: "WHATSAPP", recipient: "+15550000000",
    body: "Synthetic delayed origin", status: "SENT", providerMessageId: identity,
    createdAt, sentAt: new Date(),
  } });
  assert.equal((await request(payload)).status, 200);
  assert.equal((await request(payload)).status, 200);
  assert.equal(await db.deliveryReceipt.count({ where: { communicationId: origin.id } }), 1);
});

test("webhook size limit rejects before persistence and missing signing configuration fails closed", async () => {
  const before = (await receipts()).length;
  assert.equal((await request({}, undefined, "x".repeat(1_000_001))).status, 413);
  delete process.env.WHATSAPP_APP_SECRET;
  try { assert.equal((await request(body([status("failed")]))).status, 401); }
  finally { process.env.WHATSAPP_APP_SECRET = secret; }
  assert.equal((await receipts()).length, before);
});
