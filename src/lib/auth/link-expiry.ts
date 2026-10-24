/**
 * Link lifetimes the auth screens are allowed to state. These MIRROR the
 * backend; they do not drive it. Sources of truth:
 *
 * - RESET_LINK_TTL_MS     ← `expiresAt: new Date(Date.now() + 3600_000)` in src/app/actions/auth/reset.ts
 * - VERIFICATION_TTL      ← `const TTL = "24h"` in src/lib/auth/verification.ts
 * - RETRY_SUGGESTION_MS   ← the reset request throttle (5 requests per 5 minutes); advisory copy only
 *
 * If either backend value changes, change it here too, along with the copy
 * that quotes it (auth-copy: claims.resetExpiry, mail.tipResetExpiry, mail.tipVerifyExpiry).
 */

export const RESET_LINK_TTL_MS = 3_600_000;
export const VERIFICATION_TTL = "24h";
export const RETRY_SUGGESTION_MS = 300_000;
