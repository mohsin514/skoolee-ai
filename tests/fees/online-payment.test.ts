import assert from "node:assert/strict";
import { test } from "node:test";
import { onlinePaymentAvailability, paymentReturnPath, publicOrderStatus } from "../../src/lib/fees/online-payment";
import { safeReturnPath } from "../../src/lib/auth/return-path";

// SKO-431 / SKO-474: availability is decided before any order exists, and each role returns to its own fee page.
const keys = { SAFEPAY_MERCHANT_ID: "synthetic", SAFEPAY_API_KEY: "synthetic", SAFEPAY_SECRET_KEY: "synthetic" };
test("production without gateway keys is unavailable; the sandbox exists only outside production", () => {
  assert.deepEqual(onlinePaymentAvailability("PKR", { NODE_ENV: "production" }), { available: false, reason: "NOT_CONFIGURED", supportedCurrencies: ["PKR"] });
  assert.deepEqual(onlinePaymentAvailability("PKR", { NODE_ENV: "production", ...keys }), { available: true, mode: "PROVIDER" });
  assert.deepEqual(onlinePaymentAvailability("PKR", { NODE_ENV: "development" }), { available: true, mode: "SANDBOX" });
});
test("a currency the gateway does not settle is never offered, even with keys", () => {
  for (const currency of ["SAR", "AED", "USD"]) assert.deepEqual(onlinePaymentAvailability(currency, { NODE_ENV: "production", ...keys }), { available: false, reason: "CURRENCY_UNSUPPORTED", supportedCurrencies: ["PKR"] });
});
test("each role returns to its own fee page with the invoice, order and (for guardians) the child", () => {
  const invoice = { id: "inv-2", studentId: "child-2" };
  assert.equal(paymentReturnPath("PARENT", invoice, "SKLFEE-1"), "/parent/fees?invoice=inv-2&payment=SKLFEE-1&student=child-2");
  assert.equal(paymentReturnPath("STUDENT", invoice, "SKLFEE-1"), "/student/fees?invoice=inv-2&payment=SKLFEE-1");
  // role-ux G44b: staff return to the finance view of their own console (the legacy /dashboard console is retired).
  assert.equal(paymentReturnPath("ACCOUNTANT", invoice, "SKLFEE-1"), "/accountant?view=payments&invoice=inv-2&payment=SKLFEE-1");
  assert.equal(paymentReturnPath("CAMPUS_ADMIN", invoice, "SKLFEE-1"), "/admin?view=fees&invoice=inv-2&payment=SKLFEE-1");
  assert.equal(paymentReturnPath("ADMIN", invoice, "SKLFEE-1"), "/admin?view=fees&invoice=inv-2&payment=SKLFEE-1");
  // P8-11: roles that cannot open /admin never return there (the route refuses them before an order exists).
  assert.equal(paymentReturnPath("SUPER_ADMIN", invoice, "SKLFEE-1"), "/super");
  for (const role of ["PRINCIPAL", "RECEPTIONIST", "TEACHER", "LIBRARIAN"]) assert.ok(!paymentReturnPath(role, invoice, "SKLFEE-1").startsWith("/admin"), role);
  assert.equal(safeReturnPath(paymentReturnPath("PARENT", invoice, "SKLFEE-1"), "PARENT"), "/parent/fees?invoice=inv-2&payment=SKLFEE-1&student=child-2");
  assert.equal(safeReturnPath("https://evil.example/parent/fees", "PARENT"), null, "an external return is rejected");
  assert.equal(safeReturnPath("/admin?view=fees", "PARENT"), null, "another role's console is rejected");
});
test("only verified provider outcomes leave PENDING", () => {
  assert.deepEqual(["PENDING", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED", "weird"].map(publicOrderStatus), ["PENDING", "COMPLETED", "FAILED", "CANCELLED", "PENDING", "PENDING"]);
});
