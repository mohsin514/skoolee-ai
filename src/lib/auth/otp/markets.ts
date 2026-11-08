// SKAI-1061 / D8: per-market phone OTP configuration (PK, SA, AE).
// Decision: docs/product-review-2026-10/d8-phone-otp.md — WhatsApp copy-code first,
// SMS fallback after 30 s or when the number is not on WhatsApp.

export type OtpMarket = "PK" | "SA" | "AE";
export type OtpChannel = "whatsapp" | "sms";

export type MarketConfig = {
  market: OtpMarket;
  dialCode: string;
  /** National significant number length (digits after the dial code). */
  nsnLength: number;
  primary: OtpChannel;
  /** Seconds before the client may ask for the SMS fallback. */
  fallbackAfterSeconds: number;
  /** Env var holding the SMS sender (alphanumeric ID or number) for this market. */
  smsFromEnv: string;
  /**
   * Estimated cost per delivered message in micro-USD. `verified: false` means the
   * figure is a planning estimate from the D8 research, not a contracted rate.
   */
  cost: Record<OtpChannel, { microUsd: number | null; verified: boolean; source: string }>;
};

const D8 = "docs/product-review-2026-10/d8-phone-otp.md";

export const MARKETS: Record<OtpMarket, MarketConfig> = {
  PK: {
    market: "PK", dialCode: "92", nsnLength: 10, primary: "whatsapp", fallbackAfterSeconds: 30, smsFromEnv: "OTP_SMS_FROM_PK",
    cost: { whatsapp: { microUsd: 10_000, verified: false, source: D8 }, sms: { microUsd: 470_000, verified: false, source: D8 } },
  },
  SA: {
    market: "SA", dialCode: "966", nsnLength: 9, primary: "whatsapp", fallbackAfterSeconds: 30, smsFromEnv: "OTP_SMS_FROM_SA",
    cost: { whatsapp: { microUsd: null, verified: false, source: D8 }, sms: { microUsd: 190_000, verified: false, source: D8 } },
  },
  AE: {
    market: "AE", dialCode: "971", nsnLength: 9, primary: "whatsapp", fallbackAfterSeconds: 30, smsFromEnv: "OTP_SMS_FROM_AE",
    cost: { whatsapp: { microUsd: null, verified: false, source: D8 }, sms: { microUsd: null, verified: false, source: D8 } },
  },
};

/** `OTP_PRIMARY_CHANNEL_<MARKET>=sms` switches a market's primary (the D8 "<90% within 30 s" rule). */
export function marketConfig(market: OtpMarket, env: Record<string, string | undefined> = process.env): MarketConfig {
  const base = MARKETS[market];
  const override = env[`OTP_PRIMARY_CHANNEL_${market}`]?.toLowerCase();
  const fallback = Number(env.OTP_FALLBACK_AFTER_SECONDS);
  return {
    ...base,
    primary: override === "sms" || override === "whatsapp" ? override : base.primary,
    fallbackAfterSeconds: Number.isInteger(fallback) && fallback >= 10 && fallback <= 120 ? fallback : base.fallbackAfterSeconds,
  };
}

/**
 * Normalize user input to E.164 for a supported market, or null.
 * Accepts "+92 300 1234567", "0092…", "923001234567", and the national "03001234567"
 * form when `defaultMarket` is given.
 */
export function normalizePhone(input: unknown, defaultMarket?: OtpMarket): { e164: string; market: OtpMarket } | null {
  if (typeof input !== "string" || input.length > 32) return null;
  let digits = input.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0") && defaultMarket) digits = MARKETS[defaultMarket].dialCode + digits.slice(1);
  for (const m of Object.values(MARKETS)) {
    if (digits.startsWith(m.dialCode) && digits.length === m.dialCode.length + m.nsnLength && digits[m.dialCode.length] !== "0") {
      return { e164: `+${digits}`, market: m.market };
    }
  }
  return null;
}

/** Stored-format variants of one number, for matching legacy unnormalized `phone` columns. */
export function phoneVariants(e164: string): string[] {
  const digits = e164.slice(1);
  const m = Object.values(MARKETS).find((x) => digits.startsWith(x.dialCode));
  const nsn = m ? digits.slice(m.dialCode.length) : digits;
  const out = new Set([e164, digits, `00${digits}`, `0${nsn}`]);
  if (m?.market === "PK") out.add(`0${nsn.slice(0, 3)}-${nsn.slice(3)}`);
  return [...out];
}
