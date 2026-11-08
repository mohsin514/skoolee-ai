// SKAI-954 / SKAI-897: V5 (cost) and V6 (activation) phone OTP report from otp_deliveries.
import type { DeliveryRow } from "./service";

export type OtpMetricsRow = {
  market: string; channel: string; sent: number; delivered: number; deliveredWithin30s: number; deliveredWithin30sRate: number | null;
  verified: number; costMicroUsd: number; costUnverified: boolean; fallbacks: number;
};

/** Per market and channel. WhatsApp cost counts only delivered messages (Meta bills on delivery). */
export function otpMetrics(rows: Pick<DeliveryRow, "market" | "channel" | "status" | "sentAt" | "deliveredAt" | "verifiedAt" | "costMicroUsd" | "costVerified" | "isFallback" | "challengeId">[]) {
  const groups = new Map<string, OtpMetricsRow>();
  for (const r of rows) {
    const key = `${r.market}:${r.channel}`;
    const g = groups.get(key) ?? { market: r.market, channel: r.channel, sent: 0, delivered: 0, deliveredWithin30s: 0, deliveredWithin30sRate: null, verified: 0, costMicroUsd: 0, costUnverified: false, fallbacks: 0 };
    if (r.status !== "failed" && r.status !== "not_on_whatsapp") g.sent++;
    if (r.deliveredAt) { g.delivered++; if (r.deliveredAt.getTime() - r.sentAt.getTime() <= 30_000) g.deliveredWithin30s++; }
    if (r.verifiedAt) g.verified++;
    if (r.isFallback) g.fallbacks++;
    const billable = r.channel === "whatsapp" ? !!r.deliveredAt : r.status !== "failed";
    if (billable && r.costMicroUsd != null) { g.costMicroUsd += r.costMicroUsd; if (!r.costVerified) g.costUnverified = true; }
    groups.set(key, g);
  }
  const byMarket = [...groups.values()].map((g) => ({ ...g, deliveredWithin30sRate: g.sent ? g.deliveredWithin30s / g.sent : null }));
  const markets = [...new Set(rows.map((r) => r.market))].map((market) => {
    const mine = rows.filter((r) => r.market === market);
    const challenges = new Set(mine.map((r) => r.challengeId)).size;
    const verified = new Set(mine.filter((r) => r.verifiedAt).map((r) => r.challengeId)).size;
    const cost = byMarket.filter((g) => g.market === market).reduce((s, g) => s + g.costMicroUsd, 0);
    const wa = byMarket.find((g) => g.market === market && g.channel === "whatsapp");
    return {
      market, challenges, verified, completionRate: challenges ? verified / challenges : null,
      costPerVerifiedUsd: verified ? cost / verified / 1e6 : null,
      // D8: switch the market's primary to SMS when WhatsApp delivered-within-30s is under 90% (after 200 OTPs).
      switchToSms: !!wa && wa.sent >= 200 && (wa.deliveredWithin30sRate ?? 0) < 0.9,
    };
  });
  return { byChannel: byMarket, byMarket: markets };
}
