import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { assignAsset, budgetPosition, closeService, createBudget, decideRequest, receiveGoods, recordInvoice, returnToSupplier, saveRequest, scheduleService, submitRequest } from "../../src/lib/purchasing/service";

// SKO-435: a request shows its budget impact; approval is by someone else within limits and commits
// once; a changed order needs approval again; deliveries are partial, idempotent and never exceed
// the order; returns reopen the remainder; invoices are matched; assets get tags, custodians and
// service history.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), schoolId = `purchasing-${randomUUID()}`, campusId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` });
const teacher = actor("TEACHER"), campusAdmin = actor("CAMPUS_ADMIN"), principal = actor("PRINCIPAL"), accountant = actor("ACCOUNTANT");
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, work);
const ids: Record<string, string> = {};
const stockOf = async () => (await raw.itemStock.findFirst({ where: { itemId: ids.item, storeId: ids.store } }))?.quantity ?? 0;

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic purchasing school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic", regId: campusId, city: "Synthetic" } });
  for (const user of [teacher, campusAdmin, principal, accountant]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  ids.store = (await raw.itemStore.create({ data: { schoolId, campusId, name: "IT room" } })).id;
  ids.item = (await raw.item.create({ data: { schoolId, campusId, name: "Laptop", unit: "each" } })).id;
  ids.supplier = (await raw.supplier.create({ data: { schoolId, campusId, name: "Synthetic Supplies" } })).id;
});
after(async () => {
  await raw.auditLog.deleteMany({ where: { schoolId } });
  for (const m of [raw.assetService, raw.schoolAsset, raw.supplierInvoice, raw.goodsReceipt, raw.purchaseRequest, raw.purchaseBudget]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect();
});

test("approval: budget shown before submitting, never by the requester, limit respected, commits once", async () => {
  await assert.rejects(() => ctx(teacher, () => createBudget(teacher, { costCenter: "IT", period: "2027", amount: 30000, currency: "SAR", approvalLimit: 5000 })), { status: 403 });
  ids.budget = (await ctx(campusAdmin, () => createBudget(campusAdmin, { costCenter: "IT", period: "2027", amount: 30000, currency: "SAR", approvalLimit: 5000 }))).id;
  const draft = await ctx(teacher, () => saveRequest(teacher, { budgetId: ids.budget, title: "Laptops for lab", supplierId: ids.supplier, lines: [{ itemId: ids.item, description: "Laptop", quantity: 10, unitPrice: 2000, asset: true }] }))!;
  ids.order = draft.id;
  const submitted = await ctx(teacher, () => submitRequest(teacher, draft.id, draft.version));
  assert.deepEqual([submitted.available, submitted.projectedAfter], [30000, 10000], "the budget impact is shown before approval");
  await assert.rejects(() => ctx(teacher, () => decideRequest(teacher, ids.order, { version: 2, decision: "APPROVE" })), { status: 403 });
  // §7.6 [R-B4]: purchasing decisions are campus operations; the principal no longer approves, and the
  // campus admin is a senior seat, so it may approve above the budget's approval limit (D4).
  await assert.rejects(() => ctx(principal, () => decideRequest(principal, ids.order, { version: 2, decision: "APPROVE" })), { status: 403 });
  await ctx(campusAdmin, () => decideRequest(campusAdmin, ids.order, { version: 2, decision: "APPROVE" }));
  assert.equal((await ctx(campusAdmin, () => budgetPosition(prisma, ids.budget))).committed, 20000);
  const second = await ctx(teacher, () => saveRequest(teacher, { budgetId: ids.budget, title: "Projectors", lines: [{ description: "Projector", quantity: 6, unitPrice: 2000 }] }))!;
  await ctx(teacher, () => submitRequest(teacher, second.id, second.version));
  await assert.rejects(() => ctx(campusAdmin, () => decideRequest(campusAdmin, second.id, { version: 2, decision: "APPROVE" })), /2000 SAR above available budget/);
});

test("SD3: the campus's only campus admin may decide their own request, with a typed reason and an audit flag", async () => {
  const own = await ctx(campusAdmin, () => saveRequest(campusAdmin, { budgetId: ids.budget, title: "Whiteboard markers", lines: [{ description: "Marker box", quantity: 2, unitPrice: 20 }] }))!;
  await ctx(campusAdmin, () => submitRequest(campusAdmin, own.id, own.version));
  await assert.rejects(() => ctx(campusAdmin, () => decideRequest(campusAdmin, own.id, { version: 2, decision: "APPROVE" })), /reason of at least 10 characters/);
  await ctx(campusAdmin, () => decideRequest(campusAdmin, own.id, { version: 2, decision: "APPROVE", reason: "Only administrator on this campus this term" }));
  const decided = await raw.purchaseRequest.findUniqueOrThrow({ where: { id: own.id } });
  assert.equal(decided.status, "APPROVED");
  assert.ok((decided.history as Array<{ selfApproved?: boolean }>).some((entry) => entry.selfApproved === true), "the history records a self-approval");
  assert.equal(await raw.auditLog.count({ where: { schoolId, recordId: own.id, tableName: "purchase_requests" } }), 1);
});

test("changing an approved order's price withdraws the approval", async () => {
  const extra = await ctx(teacher, () => saveRequest(teacher, { budgetId: ids.budget, title: "Cables", lines: [{ description: "HDMI cable", quantity: 4, unitPrice: 50 }] }))!;
  await ctx(teacher, () => submitRequest(teacher, extra.id, extra.version));
  await ctx(campusAdmin, () => decideRequest(campusAdmin, extra.id, { version: 2, decision: "APPROVE" }));
  const changed = await ctx(teacher, () => saveRequest(teacher, { budgetId: ids.budget, title: "Cables", lines: [{ description: "HDMI cable", quantity: 4, unitPrice: 75 }] }, extra.id, 3));
  assert.deepEqual([changed!.status, changed!.approvedById], ["SUBMITTED", null]);
  await assert.rejects(() => ctx(teacher, () => saveRequest(teacher, { budgetId: ids.budget, title: "Cables", lines: [{ description: "HDMI cable", quantity: 4, unitPrice: 80 }] }, extra.id, 3)), /changed since you opened it/);
});

test("receive six of ten, retry, over-deliver and return one: stock, order and budget reconcile", async () => {
  const key = randomUUID().replace(/-/g, "");
  const first = await ctx(accountant, () => receiveGoods(accountant, ids.order, { idempotencyKey: key, deliveryNote: "DN-88", lines: [{ line: 0, quantity: 6, storeId: ids.store }] }));
  assert.deepEqual(first.remaining, [4]);
  const retry = await ctx(accountant, () => receiveGoods(accountant, ids.order, { idempotencyKey: key, deliveryNote: "DN-88", lines: [{ line: 0, quantity: 6, storeId: ids.store }] }));
  assert.equal(retry.replayed, true);
  assert.equal(await stockOf(), 6, "a retried receipt moves stock once");
  assert.equal(await raw.schoolAsset.count({ where: { requestId: ids.order } }), 6, "one tagged asset per received unit");
  const tags = (await raw.schoolAsset.findMany({ where: { requestId: ids.order }, select: { tag: true } })).map((a) => a.tag);
  assert.equal(new Set(tags).size, 6);
  await ctx(accountant, () => returnToSupplier(accountant, ids.order, { line: 0, quantity: 1, storeId: ids.store, reason: "Cracked screen", idempotencyKey: randomUUID().replace(/-/g, "") }));
  assert.equal(await stockOf(), 5);
  const over = await ctx(accountant, () => receiveGoods(accountant, ids.order, { idempotencyKey: randomUUID().replace(/-/g, ""), lines: [{ line: 0, quantity: 7, storeId: ids.store }] }));
  assert.deepEqual(over.remaining, [0]);
  assert.equal((over.receipt.discrepancies as { excess: number }[])[0].excess, 2, "over-delivery is flagged, not received");
  assert.equal(await stockOf(), 10);
  const order = await raw.purchaseRequest.findUniqueOrThrow({ where: { id: ids.order } });
  assert.deepEqual([order.status, (order.received as number[])[0]], ["RECEIVED", 10]);
  const position = await ctx(campusAdmin, () => budgetPosition(prisma, ids.budget));
  assert.equal(position.spent, 20000, "value received matches the order; receipt is not payment");
  const movements = await raw.itemTransaction.findMany({ where: { itemId: ids.item } });
  assert.equal(movements.reduce((s, m) => s + (m.kind === "RECEIVE" ? m.quantity : -m.quantity), 0), await stockOf(), "stock reconciles to movements");
});

test("invoices are matched; variance and duplicates go to review", async () => {
  const ok = await ctx(accountant, () => recordInvoice(accountant, ids.order, { invoiceNo: "INV-1", amount: 20000 }));
  assert.equal(ok.status, "MATCHED");
  const dup = await ctx(accountant, () => recordInvoice(accountant, ids.order, { invoiceNo: "INV-1", amount: 20300 }));
  assert.equal(dup.status, "REVIEW");
  assert.deepEqual((dup.issues as { code: string }[]).map((i) => i.code).sort(), ["DUPLICATE", "PRICE_VARIANCE"]);
});

test("assets keep custodian history and a service schedule; closing records work and the next date", async () => {
  const asset = await raw.schoolAsset.findFirstOrThrow({ where: { requestId: ids.order }, orderBy: { tag: "asc" } });
  await assert.rejects(() => ctx(teacher, () => assignAsset(teacher, asset.id, { custodian: "Synthetic Lab Lead" })), { status: 403 });
  await ctx(campusAdmin, () => assignAsset(campusAdmin, asset.id, { custodian: "Synthetic Lab Lead", location: "Lab 2" }));
  await ctx(campusAdmin, () => assignAsset(campusAdmin, asset.id, { location: "Lab 3" }));
  const moved = await raw.schoolAsset.findUniqueOrThrow({ where: { id: asset.id } });
  assert.equal((moved.history as unknown[]).length, 3, "received, assigned, moved — all kept");
  const job = await ctx(campusAdmin, () => scheduleService(campusAdmin, asset.id, { dueOn: "2027-01-10" }));
  await assert.rejects(() => ctx(campusAdmin, () => closeService(campusAdmin, job.id, { action: "COMPLETE", work: "Battery check" })), { status: 400 });
  await ctx(campusAdmin, () => closeService(campusAdmin, job.id, { action: "COMPLETE", work: "Battery check and cleaning", nextDueOn: "2027-07-10" }));
  assert.equal((await raw.schoolAsset.findUniqueOrThrow({ where: { id: asset.id } })).nextServiceOn?.toISOString().slice(0, 10), "2027-07-10");
  assert.equal(await raw.assetService.count({ where: { assetId: asset.id } }), 2, "the done job stays and the next one is scheduled");
});
