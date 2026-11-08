import { dashboardPathForRole } from "@/lib/roles";

// SKO-431 / SKO-474: whether an online payment can actually be taken for an invoice, decided before
// any order exists, and where each role returns after the hosted checkout. The return path is built
// on the server from the caller's role and the authorized invoice, never from request input.

export const ONLINE_PAYMENT_CURRENCIES = ["PKR"] as const;

export type OnlinePaymentAvailability =
  | { available: true; mode: "PROVIDER" | "SANDBOX" }
  | { available: false; reason: "CURRENCY_UNSUPPORTED" | "NOT_CONFIGURED"; supportedCurrencies: readonly string[] };

type Env = Record<string, string | undefined>;

/** SafePay settles PKR only. The sandbox card form exists only outside production. */
export function onlinePaymentAvailability(currency: string, env: Env = process.env): OnlinePaymentAvailability {
  if (!(ONLINE_PAYMENT_CURRENCIES as readonly string[]).includes(currency)) return { available: false, reason: "CURRENCY_UNSUPPORTED", supportedCurrencies: ONLINE_PAYMENT_CURRENCIES };
  if (env.SAFEPAY_MERCHANT_ID && env.SAFEPAY_API_KEY && env.SAFEPAY_SECRET_KEY) return { available: true, mode: "PROVIDER" };
  if (env.NODE_ENV !== "production") return { available: true, mode: "SANDBOX" };
  return { available: false, reason: "NOT_CONFIGURED", supportedCurrencies: ONLINE_PAYMENT_CURRENCIES };
}

/** Staff who may take an online payment on a family's behalf: the finance desk (role-ux G44b, P8-11). */
export const ONLINE_PAYMENT_STAFF: readonly string[] = ["ACCOUNTANT", "CAMPUS_ADMIN", "ADMIN", "SUPER_ADMIN"];

/**
 * The page a payer comes back to: the family's own fee page with the same child and invoice, or — for staff —
 * the finance view of their own console (role-ux G44b; the legacy /dashboard console is retired). Only campus
 * admins come back to `/admin`; the group admin returns to the group console; any other role (refused by the
 * route before an order exists) would land on its own console home, never on a console it cannot open.
 */
export function paymentReturnPath(role: string, invoice: { id: string; studentId: string }, orderRef: string) {
  const query = new URLSearchParams({ invoice: invoice.id, payment: orderRef });
  if (role === "PARENT") { query.set("student", invoice.studentId); return `/parent/fees?${query}`; }
  if (role === "STUDENT") return `/student/fees?${query}`;
  if (role === "ACCOUNTANT") return `/accountant?${new URLSearchParams({ view: "payments", invoice: invoice.id, payment: orderRef })}`;
  if (role === "CAMPUS_ADMIN" || role === "ADMIN") return `/admin?${new URLSearchParams({ view: "fees", invoice: invoice.id, payment: orderRef })}`;
  return dashboardPathForRole(role);
}

/** What a payer is told about an order. Only a verified provider event moves it past PENDING. */
export type PaymentOrderStatus = "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
export function publicOrderStatus(status: string): PaymentOrderStatus {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" ? status : "PENDING";
}
