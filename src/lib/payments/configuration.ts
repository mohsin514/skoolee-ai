export type PaymentMethod = "stripe" | "safepay" | "bank_transfer";
export type PaymentReadiness = {
  state: "missing" | "incomplete" | "invalid" | "configured-unverified";
  mode: "sandbox" | "live" | "manual" | "unknown";
  connectivity: "not-tested";
};
export interface PaymentConfig {
  method: PaymentMethod | null;
  availableMethods: PaymentMethod[];
  readiness: Record<PaymentMethod, PaymentReadiness>;
  stripe?: { connectedAccountId: string; onboardingComplete: boolean };
  safepay?: { enabled: boolean; merchantId: string };
  bank?: { bankName: string; accountTitle: string; accountNumber: string; iban: string | null } | null;
}
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const placeholder = (value: unknown) => typeof value === "string" && /^(dev_mode|changeme|placeholder|your[-_ ].*|replace[-_ ].*)$/i.test(value.trim());

/** Syntactic readiness only. Provider acceptance and tenant onboarding are separate. */
export function paymentConfiguration(settings: Record<string, unknown>, env: Record<string, string | undefined> = process.env): PaymentConfig {
  const status = (values: unknown[], valid: boolean, mode: PaymentReadiness["mode"]): PaymentReadiness => ({
    state: values.every(value => !text(value)) ? "missing" : values.some(placeholder) || !valid ? "invalid" : values.every(text) ? "configured-unverified" : "incomplete",
    mode, connectivity: "not-tested",
  });
  const stripeKey = env.STRIPE_SECRET_KEY;
  const stripeMode = stripeKey?.startsWith("sk_test_") ? "sandbox" : stripeKey?.startsWith("sk_live_") ? "live" : "unknown";
  const stripeStatus = status([stripeKey, settings.connectedAccountId], (!stripeKey || /^sk_(test|live)_[a-zA-Z0-9]+$/.test(stripeKey)) && (!settings.connectedAccountId || typeof settings.connectedAccountId === "string" && /^acct_[a-zA-Z0-9]+$/.test(settings.connectedAccountId)), stripeMode);
  if (stripeStatus.state === "configured-unverified" && settings.onboardingComplete !== true) stripeStatus.state = "incomplete";
  const safeStatus = status([env.SAFEPAY_MERCHANT_ID, env.SAFEPAY_API_KEY, env.SAFEPAY_SECRET_KEY], env.SAFEPAY_PRODUCTION === undefined || ["true", "false"].includes(env.SAFEPAY_PRODUCTION), env.SAFEPAY_PRODUCTION === "true" ? "live" : "sandbox");
  const bankStatus = status([settings.bankName, settings.accountTitle, settings.accountNumber], true, "manual");
  const readiness = { stripe: stripeStatus, safepay: safeStatus, bank_transfer: bankStatus };
  const availableMethods: PaymentMethod[] = (["safepay", "stripe", "bank_transfer"] as const).filter(method => readiness[method].state === "configured-unverified");
  return {
    method: availableMethods[0] ?? null, availableMethods, readiness,
    ...(availableMethods.includes("stripe") ? { stripe: { connectedAccountId: settings.connectedAccountId as string, onboardingComplete: true } } : {}),
    ...(availableMethods.includes("safepay") ? { safepay: { enabled: true, merchantId: env.SAFEPAY_MERCHANT_ID! } } : {}),
    bank: availableMethods.includes("bank_transfer") ? { bankName: settings.bankName as string, accountTitle: settings.accountTitle as string, accountNumber: settings.accountNumber as string, iban: text(settings.iban) ? settings.iban : null } : null,
  };
}
