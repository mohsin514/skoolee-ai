import { createSafePayOrder, verifySafePayNotification } from "./safepay";

/**
 * SKAI-1107 (spike): one interface for hosted-checkout payment rails, so a GCC provider can be added
 * as an adapter without touching fee or onboarding routes. Nothing here is wired into a route yet;
 * existing SafePay callers are unchanged. GCC adapters are skeletons behind PAYMENT_GCC_RAILS_ENABLED
 * and refuse to run: there are no keys, sandbox or live, in this module.
 */
export type ProviderId = "safepay" | "stripe_uae" | "checkout_com" | "telr" | "paytabs" | "network_international" | "tap";

export type CheckoutRequest = { amountMinor: number; currency: string; orderRef: string; description: string; returnUrl: string; metadata?: Record<string, string> };
export type CheckoutResult = { ok: true; redirectUrl: string; providerRef?: string } | { ok: false; code: "NOT_IMPLEMENTED" | "PROVIDER_ERROR" | "CURRENCY_UNSUPPORTED"; message: string };
export type WebhookInput = { rawBody: string; headers: Record<string, string | undefined> };

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly currencies: readonly string[];
  /** Env names this adapter needs; values are never logged or returned. */
  readonly requiredEnv: readonly string[];
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /** Signature check only; the caller still re-reads order state before marking anything paid. */
  verifyWebhook(input: WebhookInput): boolean;
}

type Env = Record<string, string | undefined>;

/** Minor units per currency: GCC dinars use 3 decimals (KWD, BHD, OMR), the rest 2. */
export const currencyExponent = (currency: string) => (["KWD", "BHD", "OMR"].includes(currency) ? 3 : 2);

export function safePayProvider(env: Env = process.env): PaymentProvider {
  return {
    id: "safepay",
    currencies: ["PKR"],
    requiredEnv: ["SAFEPAY_MERCHANT_ID", "SAFEPAY_API_KEY", "SAFEPAY_SECRET_KEY"],
    async createCheckout(request) {
      if (request.currency !== "PKR") return { ok: false, code: "CURRENCY_UNSUPPORTED", message: "SafePay settles PKR only." };
      const result = await createSafePayOrder(
        { merchantId: env.SAFEPAY_MERCHANT_ID ?? "", apiKey: env.SAFEPAY_API_KEY ?? "", secretKey: env.SAFEPAY_SECRET_KEY ?? "", returnUrl: request.returnUrl, sandbox: env.SAFEPAY_PRODUCTION !== "true" },
        { amount: request.amountMinor / 100, orderRef: request.orderRef, description: request.description, metadata: request.metadata },
      );
      return result.success && result.redirectUrl ? { ok: true, redirectUrl: result.redirectUrl, providerRef: result.token } : { ok: false, code: "PROVIDER_ERROR", message: result.error ?? "SafePay did not return a checkout URL." };
    },
    verifyWebhook({ rawBody }) {
      try { return verifySafePayNotification(JSON.parse(rawBody) as Record<string, unknown>, env.SAFEPAY_SECRET_KEY ?? ""); } catch { return false; }
    },
  };
}

/** Research summary per GCC rail (see docs/research/2026-10/payment-rails.md). */
const gccRails: Record<Exclude<ProviderId, "safepay">, { currencies: readonly string[]; requiredEnv: readonly string[] }> = {
  stripe_uae: { currencies: ["AED", "SAR", "USD"], requiredEnv: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
  checkout_com: { currencies: ["AED", "SAR", "KWD", "BHD", "QAR", "OMR", "USD"], requiredEnv: ["CHECKOUT_COM_SECRET_KEY", "CHECKOUT_COM_WEBHOOK_SECRET"] },
  telr: { currencies: ["AED", "SAR", "KWD", "BHD", "QAR", "OMR"], requiredEnv: ["TELR_STORE_ID", "TELR_AUTH_KEY"] },
  paytabs: { currencies: ["SAR", "AED", "KWD", "BHD", "QAR", "OMR", "EGP"], requiredEnv: ["PAYTABS_PROFILE_ID", "PAYTABS_SERVER_KEY"] },
  network_international: { currencies: ["AED", "SAR", "USD"], requiredEnv: ["NGENIUS_OUTLET_REF", "NGENIUS_API_KEY"] },
  tap: { currencies: ["KWD", "SAR", "AED", "BHD", "QAR", "OMR"], requiredEnv: ["TAP_SECRET_KEY"] },
};

/** Skeleton adapter: declares its shape, never calls the network, never accepts a webhook. */
export function gccSkeletonProvider(id: Exclude<ProviderId, "safepay">): PaymentProvider {
  const rail = gccRails[id];
  return {
    id, currencies: rail.currencies, requiredEnv: rail.requiredEnv,
    async createCheckout() { return { ok: false, code: "NOT_IMPLEMENTED", message: `${id} is a SKAI-1107 skeleton; no checkout is created.` }; },
    verifyWebhook() { return false; },
  };
}

export const gccRailsEnabled = (env: Env = process.env) => env.PAYMENT_GCC_RAILS_ENABLED === "true" && env.NODE_ENV !== "production";

/**
 * The rail for a currency. SafePay for PKR (today's behaviour). GCC skeletons are returned only with
 * the flag on outside production, and only the one named by PAYMENT_GCC_PROVIDER; otherwise null.
 */
export function resolvePaymentProvider(currency: string, env: Env = process.env): PaymentProvider | null {
  if (currency === "PKR") return safePayProvider(env);
  if (!gccRailsEnabled(env)) return null;
  const id = env.PAYMENT_GCC_PROVIDER as Exclude<ProviderId, "safepay"> | undefined;
  if (!id || !(id in gccRails) || !gccRails[id].currencies.includes(currency)) return null;
  return gccSkeletonProvider(id);
}
