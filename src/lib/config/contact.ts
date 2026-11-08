/**
 * SKAI-948 / COM-08 — single source of truth for public-facing contact details.
 *
 * The domain `skoolee.ai` does NOT exist (NXDOMAIN). Every "Book a demo" /
 * "Ask about this plan" call to action previously fell back to the dead
 * `sales@skoolee.ai`. All contact points now resolve here, default to a
 * monitored `@skooleeai.com` inbox, and can be overridden per environment.
 *
 * Rule: never reintroduce a `@skoolee.ai` fallback. The live, monitored domain
 * is `skooleeai.com`.
 */

/** Monitored sales / enquiries inbox. */
export const SALES_EMAIL =
  process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@skooleeai.com";

/** Monitored support inbox. */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@skooleeai.com";

/** Transactional from-address (no-reply). */
export const NOREPLY_EMAIL =
  process.env.EMAIL_FROM || process.env.NEXT_PUBLIC_NOREPLY_EMAIL || "noreply@skooleeai.com";

/**
 * WhatsApp click-to-chat number in E.164 digits (no "+", no spaces), e.g.
 * "923001234567". Set NEXT_PUBLIC_WHATSAPP_NUMBER to enable the link; when
 * unset, helpers below return null so callers can hide the button.
 */
export const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "").replace(/[^\d]/g, "");

/** Build a `mailto:` link with a pre-filled subject (and optional body). */
export function mailtoSales(subject: string, body?: string): string {
  const q = new URLSearchParams({ subject });
  if (body) q.set("body", body);
  return `mailto:${SALES_EMAIL}?${q.toString()}`;
}

/**
 * Build a WhatsApp click-to-chat URL with a pre-filled message, or null when
 * no number is configured (so the caller renders nothing rather than a broken
 * link).
 */
export function whatsappLink(message?: string): string | null {
  if (!WHATSAPP_NUMBER) return null;
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
