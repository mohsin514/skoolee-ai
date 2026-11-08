import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import { ApiError, canManageSubscription, canManageTuition, canManageBilling, canPurchaseSubscription, errorResponse } from "../../src/lib/api/scope";
import { billingHubPath, pickParams, BILLING_RETURN_PARAMS, SUBSCRIPTION_PAUSED_MESSAGE } from "../../src/lib/billing/hub";
import { PLAN_FEATURE_MESSAGE, PLAN_LIMIT_MESSAGES, formatBillingMessage, planLimitCopy, planLimitMessage, BillingAccessError } from "../../src/lib/billing/entitlements";
import { arabicP1Ui, urduP1Ui } from "../../src/lib/locale/role-ux/p1-messages";

// role-ux §7.2 G6/G8/G10/G51: the SaaS subscription belongs to the institution authority who owns the account.

function actor(role: AuthUser["role"], changes: Partial<AuthUser> = {}): AuthUser {
  return { userId: "synthetic-user", schoolId: "synthetic-school", campusId: "campus-1", role, email: "user@example.invalid", ...changes };
}

const REFUSED: Array<[string, AuthUser]> = [
  ["campus admin in a one-campus group", actor("CAMPUS_ADMIN", { institutionKind: "GROUP", isInstitutionOwner: false, canPurchaseSubscription: false })],
  ["campus admin in a one-campus group with a stale purchase flag", actor("CAMPUS_ADMIN", { institutionKind: "GROUP", canPurchaseSubscription: true })],
  ["principal with a stale purchase flag", actor("PRINCIPAL", { institutionKind: "GROUP", canPurchaseSubscription: true })],
  ["principal in a single school with a stale purchase flag", actor("PRINCIPAL", { institutionKind: "STANDALONE", canPurchaseSubscription: true })],
  ["flagless group admin", actor("SUPER_ADMIN", { institutionKind: "GROUP", campusId: null })],
  ["ADMIN owner inside a group (anomaly)", actor("ADMIN", { institutionKind: "GROUP", isInstitutionOwner: true })],
  ["accountant", actor("ACCOUNTANT", { institutionKind: "STANDALONE", canPurchaseSubscription: true })],
  ["parent", actor("PARENT", { institutionKind: "GROUP", isInstitutionOwner: true, canPurchaseSubscription: true })],
  ["student", actor("STUDENT", { institutionKind: "STANDALONE", isInstitutionOwner: true })],
  ["platform operator", actor("APP_OWNER", { isInstitutionOwner: true, canPurchaseSubscription: true })],
  ["role-only admin without kind", actor("ADMIN", { canPurchaseSubscription: true })],
];

test("non-payers are refused by every subscription predicate", () => {
  for (const [label, user] of REFUSED) {
    assert.equal(canManageSubscription(user), false, label);
    assert.equal(canPurchaseSubscription(user), false, label);
    assert.equal(billingHubPath(user), null, `${label} has no billing hub`);
  }
});

test("the group owner, a group purchase delegate and the single-school owner pass", () => {
  const payers: Array<[string, AuthUser, string]> = [
    ["group owner", actor("SUPER_ADMIN", { institutionKind: "GROUP", isInstitutionOwner: true, campusId: null }), "/super?view=billing"],
    ["second group admin with purchase delegation", actor("SUPER_ADMIN", { institutionKind: "GROUP", canPurchaseSubscription: true, campusId: null }), "/super?view=billing"],
    ["single-school owner", actor("ADMIN", { institutionKind: "STANDALONE", isInstitutionOwner: true }), "/admin?view=billing"],
  ];
  for (const [label, user, hub] of payers) {
    assert.equal(canManageSubscription(user), true, label);
    assert.equal(canPurchaseSubscription(user), true, label);
    assert.equal(billingHubPath(user), hub, label);
  }
});

test("the billing hub keeps provider return parameters, built with URLSearchParams (no double '?')", () => {
  const owner = actor("ADMIN", { institutionKind: "STANDALONE", isInstitutionOwner: true });
  const params = pickParams({ success: "true", session_id: "cs_123", canceled: undefined, other: "x", safepay_status: ["completed", "ignored"] }, BILLING_RETURN_PARAMS);
  assert.deepEqual(params, { success: "true", session_id: "cs_123", safepay_status: "completed" });
  const href = billingHubPath(owner, params)!;
  assert.equal(href.split("?").length, 2, "exactly one query string");
  const url = new URL(href, "https://app.invalid");
  assert.equal(url.pathname, "/admin");
  assert.equal(url.searchParams.get("view"), "billing");
  assert.equal(url.searchParams.get("session_id"), "cs_123");
  assert.equal(url.searchParams.get("safepay_status"), "completed");
  assert.equal(url.searchParams.has("other"), false);
  // A provider cannot change the view.
  assert.equal(new URL(billingHubPath(owner, { view: "students" })!, "https://app.invalid").searchParams.get("view"), "billing");
});

test("tuition is not billing: the renamed helper keeps a deprecated alias", () => {
  assert.equal(canManageBilling, canManageTuition);
  assert.equal(canManageTuition(actor("ACCOUNTANT")), true);
  assert.equal(canManageTuition(actor("PRINCIPAL")), false);
  assert.equal(canManageTuition(actor("CAMPUS_ADMIN")), true);
});

test("plan and suspension errors are neutral for every role and carry a machine code (G51)", () => {
  for (const message of [SUBSCRIPTION_PAUSED_MESSAGE, PLAN_FEATURE_MESSAGE, planLimitMessage("Starter", 200, "students"), planLimitMessage("Starter", 1, "campuses")]) {
    assert.doesNotMatch(message, /Upgrade to|Open billing/i, message);
  }
  assert.equal(planLimitMessage("Starter", 1, "campuses"), "Starter allows 1 campus. The account owner can upgrade the plan.");
  assert.equal(planLimitMessage("Starter", 3, "campuses"), "Starter allows 3 campuses. The account owner can upgrade the plan.", "a real plural, never \"campuss\"");
  assert.equal(planLimitMessage("Growth", 1200, "students"), "Growth allows 1,200 students. The account owner can upgrade the plan.");
  const error = new BillingAccessError(SUBSCRIPTION_PAUSED_MESSAGE, 402, "SUBSCRIPTION_SUSPENDED");
  assert.equal(error.code, "SUBSCRIPTION_SUSPENDED");
  assert.equal(error.status, 402);
});

test("plan-limit copy is a placeholder key per unit with Arabic and Urdu, filled with isolated values (R11, R7)", () => {
  for (const { one, many } of Object.values(PLAN_LIMIT_MESSAGES)) {
    for (const key of [one, many]) {
      assert.match(key, /^\{0\} allows \{1\} \w+\. The account owner can upgrade the plan\.$/, key);
      for (const [language, catalog] of [["ar", arabicP1Ui], ["ur", urduP1Ui]] as const) {
        const translated = catalog[key];
        assert.ok(translated, `${language}: ${key}`);
        assert.ok(translated.includes("{0}") && translated.includes("{1}"), `${language} keeps both placeholders: ${key}`);
      }
    }
  }
  assert.deepEqual(planLimitCopy("Starter", 200, "teachers"), { messageKey: "{0} allows {1} teachers. The account owner can upgrade the plan.", params: ["Starter", "200"] });
  const arabic = planLimitMessage("Starter", 200, "students", "ar");
  assert.ok(arabic.includes("\u2068Starter\u2069") && arabic.includes("\u2068200\u2069"), "plan name and number are isolated in an RTL sentence");
  assert.doesNotMatch(arabic, /allows|account owner/, "fully Arabic");
  assert.doesNotMatch(planLimitMessage("Starter", 1, "campuses", "ur"), /allows|account owner/, "fully Urdu");
  assert.equal(formatBillingMessage("Not a key {0}", ["x"], "ar"), "Not a key \u2068x\u2069", "an unknown key falls back to English text");
});

test("errorResponse sends a plan-limit error's key and values with its code, for a client that formats it", async () => {
  const copy = planLimitCopy("Starter", 200, "students");
  const response = errorResponse(new BillingAccessError(planLimitMessage("Starter", 200, "students"), 402, "PLAN_LIMIT", copy));
  assert.equal(response.status, 402);
  assert.deepEqual(await response.json(), { error: "Starter allows 200 students. The account owner can upgrade the plan.", code: "PLAN_LIMIT", messageKey: copy.messageKey, params: ["Starter", "200"] });
  const paused = errorResponse(new BillingAccessError(SUBSCRIPTION_PAUSED_MESSAGE, 402, "SUBSCRIPTION_SUSPENDED"));
  assert.deepEqual(await paused.json(), { error: SUBSCRIPTION_PAUSED_MESSAGE, code: "SUBSCRIPTION_SUSPENDED" }, "exact keys need no values");
});

test("no billing error copy in the server sources says 'Upgrade to' or 'Open billing'", () => {
  for (const file of ["src/lib/billing/entitlements.ts", "src/lib/ai/openai.ts", "src/proxy.ts", "src/app/api/billing/route.ts", "src/app/api/billing/lifecycle/route.ts", "src/app/api/stripe/checkout/route.ts", "src/app/api/stripe/portal/route.ts"]) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /["'`][^"'`]*(Upgrade to|Open billing)[^"'`]*["'`]/, file);
  }
});

test("every external return lands on /billing (§6.2)", () => {
  const stripe = readFileSync(new URL("../../src/lib/stripe/server.ts", import.meta.url), "utf8");
  const checkout = readFileSync(new URL("../../src/app/api/stripe/checkout/route.ts", import.meta.url), "utf8");
  const safepay = readFileSync(new URL("../../src/app/safepay/page.tsx", import.meta.url), "utf8");
  for (const [name, source] of [["stripe", stripe], ["checkout", checkout], ["safepay", safepay]] as const) {
    assert.doesNotMatch(source, /\/dashboard\/billing/, `${name} no longer returns to the legacy hub`);
    assert.match(source, /\/billing\?/, `${name} returns to /billing`);
  }
});

test("errorResponse carries an ApiError's machine code (MFA_REQUIRED, F28) and nothing extra without one", async () => {
  const withCode = errorResponse(new ApiError("Turn on two-step sign-in before you change role permissions.", 403, "MFA_REQUIRED"));
  assert.equal(withCode.status, 403);
  assert.deepEqual(await withCode.json(), { error: "Turn on two-step sign-in before you change role permissions.", code: "MFA_REQUIRED" });
  const plain = errorResponse(new ApiError("Choose a campus.", 400));
  assert.deepEqual(await plain.json(), { error: "Choose a campus." });
});
