import assert from "node:assert/strict";
import test from "node:test";
import { COMMERCIAL_CONTRACT } from "@/config/commercial-contract";
import { PLANS } from "@/config/plans";
import {
  assertOnboardingOwner,
  assertSubscriptionPurchaser,
  checkoutAmount,
  onboardingCheckoutSchema,
  packageContract,
} from "@/lib/billing/checkout-intents";
import { canPurchaseSubscription } from "@/lib/api/scope";
import type { AuthUser } from "@/lib/auth";

function actor(role: AuthUser["role"], changes: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: "synthetic-user",
    schoolId: "synthetic-school",
    campusId: null,
    role,
    email: "owner@example.invalid",
    isInstitutionOwner: false,
    canPurchaseSubscription: false,
    onboardingComplete: false,
    ...changes,
  };
}

test("package comparisons derive every limit and price from the approved catalogue", () => {
  for (const plan of ["FREE", "BASIC", "PRO", "ENTERPRISE"] as const) {
    const snapshot = packageContract(plan);
    assert.equal(snapshot.catalogVersion, COMMERCIAL_CONTRACT.version);
    assert.equal(snapshot.price, PLANS[plan].price);
    assert.equal(snapshot.priceCurrency, "PKR");
    assert.equal(snapshot.maxStudents, PLANS[plan].maxStudents);
    assert.equal(snapshot.maxTeachers, PLANS[plan].maxTeachers);
    assert.equal(snapshot.maxCampuses, PLANS[plan].maxCampuses);
    assert.equal(snapshot.aiCredits, PLANS[plan].aiCredits);
  }
});

test("checkout amounts use only the catalogue annual discount and no custom quote price", () => {
  assert.equal(checkoutAmount(packageContract("FREE"), "monthly"), 0);
  assert.equal(checkoutAmount(packageContract("BASIC"), "monthly"), 4000);
  assert.equal(checkoutAmount(packageContract("BASIC"), "annual"), 38400);
  assert.equal(checkoutAmount(packageContract("PRO"), "annual"), 67200);
  assert.equal(checkoutAmount(packageContract("ENTERPRISE"), "annual"), null);
});

test("only a verified owner can enter package choice during incomplete onboarding", () => {
  for (const role of ["SUPER_ADMIN", "ADMIN"] as const) {
    assert.doesNotThrow(() => assertOnboardingOwner(actor(role, { isInstitutionOwner: true })));
    assert.throws(() => assertOnboardingOwner(actor(role, { isInstitutionOwner: true, onboardingComplete: true })), { status: 403 });
    assert.throws(() => assertOnboardingOwner(actor(role)), { status: 403 });
  }
  for (const role of ["TEACHER", "STUDENT", "PARENT", "CAMPUS_ADMIN", "APP_OWNER"] as const) {
    assert.throws(() => assertOnboardingOwner(actor(role, { isInstitutionOwner: true })), { status: 403 });
  }
});

test("institution purchase delegation excludes pupils, guardians and the platform operator", () => {
  for (const role of ["STUDENT", "PARENT", "APP_OWNER"] as const) {
    const delegated = actor(role, { canPurchaseSubscription: true, isInstitutionOwner: true });
    assert.equal(canPurchaseSubscription(delegated), false);
    assert.throws(() => assertSubscriptionPurchaser(delegated), { status: 403 });
  }
  for (const role of ["TEACHER", "CAMPUS_ADMIN", "PRINCIPAL"] as const) {
    assert.equal(canPurchaseSubscription(actor(role)), false);
    assert.throws(() => assertSubscriptionPurchaser(actor(role)), { status: 403 });
    const delegated = actor(role, { canPurchaseSubscription: true });
    assert.equal(canPurchaseSubscription(delegated), true);
    assert.doesNotThrow(() => assertSubscriptionPurchaser(delegated));
  }
  assert.equal(canPurchaseSubscription(actor("SUPER_ADMIN", { isInstitutionOwner: true })), true);
});

test("intent validation bounds sizing and keeps idempotency and return-state fields explicit", () => {
  const valid = onboardingCheckoutSchema.safeParse({
    plan: "BASIC",
    billingPeriod: "annual",
    expectedCampuses: 5,
    expectedEnrollment: 2500,
    returnStep: "campuses",
    idempotencyKey: "synthetic-key-000001",
  });
  assert.equal(valid.success, true);
  assert.equal(onboardingCheckoutSchema.safeParse({
    plan: "BASIC", expectedCampuses: 0, expectedEnrollment: -1, idempotencyKey: "x",
  }).success, false);
  assert.equal(onboardingCheckoutSchema.safeParse({
    plan: "FREE", expectedCampuses: 1, expectedEnrollment: 10, returnStep: "/admin", idempotencyKey: "synthetic-key-000001",
  }).success, false);
});
