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

test("checkout amounts are price × billed students (raised to the minimum), with the catalogue annual discount", () => {
  assert.equal(checkoutAmount(packageContract("FREE", PLANS.FREE, 900), "monthly"), 0);
  assert.equal(packageContract("FREE", PLANS.FREE, 900).billedStudents, null);
  // 40 expected students bill the 100-student minimum.
  assert.equal(packageContract("BASIC", PLANS.BASIC, 40).billedStudents, 100);
  assert.equal(checkoutAmount(packageContract("BASIC", PLANS.BASIC, 40), "monthly"), 1500);
  assert.equal(checkoutAmount(packageContract("BASIC", PLANS.BASIC, 40), "annual"), 14400);
  assert.equal(checkoutAmount(packageContract("BASIC", PLANS.BASIC, 300), "monthly"), 4500);
  assert.equal(checkoutAmount(packageContract("PRO", PLANS.PRO, 300), "annual"), 115200);
  assert.equal(checkoutAmount(packageContract("ENTERPRISE", PLANS.ENTERPRISE, 1500), "monthly"), 90000);
  assert.equal(checkoutAmount(packageContract("ENTERPRISE", PLANS.ENTERPRISE, 10), "monthly"), 36000, "Network bills at least 600");
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
  // role-ux §7.2 G6: a purchase flag on a non-authority role is inert (stale delegations stay harmless).
  for (const role of ["TEACHER", "CAMPUS_ADMIN", "PRINCIPAL"] as const) {
    assert.equal(canPurchaseSubscription(actor(role)), false);
    assert.throws(() => assertSubscriptionPurchaser(actor(role)), { status: 403 });
    const delegated = actor(role, { canPurchaseSubscription: true, institutionKind: "GROUP" });
    assert.equal(canPurchaseSubscription(delegated), false);
    assert.throws(() => assertSubscriptionPurchaser(delegated), { status: 403 });
  }
  // An authority-role delegate (another group admin) may buy; so may the owner of either kind of school.
  const groupDelegate = actor("SUPER_ADMIN", { canPurchaseSubscription: true, institutionKind: "GROUP" });
  assert.equal(canPurchaseSubscription(groupDelegate), true);
  assert.doesNotThrow(() => assertSubscriptionPurchaser(groupDelegate));
  assert.equal(canPurchaseSubscription(actor("SUPER_ADMIN", { isInstitutionOwner: true })), true);
  assert.equal(canPurchaseSubscription(actor("ADMIN", { isInstitutionOwner: true, institutionKind: "STANDALONE" })), true);
  assert.equal(canPurchaseSubscription(actor("ADMIN", { isInstitutionOwner: true, institutionKind: "GROUP" })), false);
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

test("SKAI-156: setup never downgrades to Free or below the school's active campuses", async () => {
  const { assertPackageFitsSchool } = await import("@/lib/billing/checkout-intents");
  // A paid school cannot drop to Free through a direct API call.
  assert.throws(() => assertPackageFitsSchool("FREE", PLANS.FREE, { currentPlan: "PRO", activeCampuses: 1 }), { status: 409 });
  assert.doesNotThrow(() => assertPackageFitsSchool("FREE", PLANS.FREE, { currentPlan: "FREE", activeCampuses: 1 }));
  // Catalogue plans have no campus limit; terms that carry one (older or negotiated) still refuse a school above it.
  for (const plan of ["FREE", "BASIC", "PRO", "ENTERPRISE"] as const) {
    assert.doesNotThrow(() => assertPackageFitsSchool(plan, PLANS[plan], { currentPlan: "FREE", activeCampuses: 40 }));
  }
  const capped = { price: 4000, maxCampuses: 1 };
  assert.throws(() => assertPackageFitsSchool("BASIC", capped, { currentPlan: "PRO", activeCampuses: 3 }), { status: 409 });
  assert.doesNotThrow(() => assertPackageFitsSchool("BASIC", capped, { currentPlan: "FREE", activeCampuses: 1 }), "the boundary is inclusive");
});
