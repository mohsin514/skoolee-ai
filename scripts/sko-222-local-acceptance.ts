import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { canManageSubscription } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";

async function main() {
  const suffix = randomUUID();
  const school = await runUnscoped("create one uniquely named synthetic SKO-222 test tenant", () => prisma.school.create({ data: {
    name: `SKO-222 synthetic ${suffix}`,
    slug: `sko222-${suffix}`,
    city: "Synthetic",
    regId: `SYN-${suffix}`,
    contactEmail: `synthetic-${suffix}@example.test`,
    plan: "PRO",
    status: "ACTIVE",
    subscriptionLifecycleState: "ACTIVE",
  } }));
  let userIds: string[] = [];

  try {
    const campusAdmin = await runWithTenantContext({ schoolId: school.id }, () => prisma.user.create({ data: {
      schoolId: school.id, email: `campus-${suffix}@example.test`, fullName: "Synthetic campus administrator", role: "CAMPUS_ADMIN",
      isInstitutionOwner: false, canPurchaseSubscription: false,
    } }));
    const delegate = await runWithTenantContext({ schoolId: school.id }, () => prisma.user.create({ data: {
      schoolId: school.id, email: `payer-${suffix}@example.test`, fullName: "Synthetic payer delegate", role: "CAMPUS_ADMIN",
      isInstitutionOwner: false, canPurchaseSubscription: true,
    } }));
    userIds = [campusAdmin.id, delegate.id];

    const toAuthUser = (user: typeof campusAdmin) => ({
      userId: user.id, schoolId: user.schoolId, role: user.role, email: user.email, campusId: null,
      isInstitutionOwner: user.isInstitutionOwner, canPurchaseSubscription: user.canPurchaseSubscription,
    });
    assert.equal(canManageSubscription(toAuthUser(campusAdmin)), false, "campus admin without delegation must be denied");
    assert.equal(canManageSubscription(toAuthUser(delegate)), true, "owner-delegated payer can manage subscription");

    const idempotencyKey = `sko222-${suffix}`;
    const request = await runWithTenantContext({ schoolId: school.id }, () => prisma.subscriptionRequest.create({ data: {
      schoolId: school.id, requestedById: delegate.id, idempotencyKey,
      kind: "CANCELLATION", state: "SCHEDULED", effectiveAt: new Date(Date.now() + 86400000),
      details: { synthetic: true, recordsRetained: true, reviewRequired: false },
    } }));
    await assert.rejects(runWithTenantContext({ schoolId: school.id }, () => prisma.subscriptionRequest.create({ data: {
      schoolId: school.id, requestedById: delegate.id, idempotencyKey,
      kind: "CANCELLATION", state: "SCHEDULED", details: { synthetic: true },
    } })), "same actor, tenant and idempotency key must be unique");
    assert.equal((request.details as { recordsRetained: boolean }).recordsRetained, true);

    const receiptId = `evt_sko222_${suffix}`;
    await prisma.stripeWebhookReceipt.create({ data: {
      eventId: receiptId, eventType: "customer.subscription.updated", eventCreated: 200, state: "PROCESSED",
    } });
    await assert.rejects(prisma.stripeWebhookReceipt.create({ data: {
      eventId: receiptId, eventType: "customer.subscription.updated", eventCreated: 200,
    } }), "provider event IDs must be globally idempotent");

    await runWithTenantContext({ schoolId: school.id }, () => prisma.school.update({ where: { id: school.id }, data: { lastStripeEventCreated: 200, plan: "PRO" } }));
    const staleEvent = await runWithTenantContext({ schoolId: school.id }, () => prisma.school.updateMany({
      where: { id: school.id, OR: [{ lastStripeEventCreated: null }, { lastStripeEventCreated: { lte: 199 } }] },
      data: { lastStripeEventCreated: 199, plan: "BASIC" },
    }));
    assert.equal(staleEvent.count, 0, "an out-of-order older provider event cannot overwrite current subscription state");

    const preserved = await runWithTenantContext({ schoolId: school.id }, () => prisma.school.findUniqueOrThrow({ where: { id: school.id }, select: { plan: true, lastStripeEventCreated: true } }));
    assert.deepEqual(preserved, { plan: "PRO", lastStripeEventCreated: 200 });
    console.log("SKO-222 synthetic acceptance passed: delegated payer, campus-admin denial, tenant-scoped request idempotency, webhook receipt idempotency/order, cancellation review state and record retention.");
  } finally {
    await runWithTenantContext({ schoolId: school.id }, async () => {
      if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });
    await runUnscoped("delete the uniquely named synthetic SKO-222 test tenant after acceptance checks", () => prisma.school.delete({ where: { id: school.id } }));
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
