// SKAI-82: sign-in throttling, in one place so the windows can be tested.
//
// The address+IP and IP buckets stop one client hammering the form, but an
// attacker rotating addresses could still guess one account's password without
// bound. The account bucket closes that: after enough failures from anywhere the
// address is locked for the rest of its window. It is keyed on the submitted
// address whether or not an account exists, so the lockout itself never reveals
// which addresses are registered.
import { authRateLimit } from "@/lib/auth/rate-limit";

export const LOGIN_LIMITS = {
  client: { limit: 10, windowMs: 60_000 },
  ip: { limit: 60, windowMs: 60_000 },
  account: { limit: 30, windowMs: 15 * 60_000 },
} as const;

export function loginThrottleScopes(ip: string, email: string) {
  return {
    client: `login:${ip}:${email}`,
    ip: `login-ip:${ip}`,
    account: `login-account:${email}`,
  };
}

type Limiter = typeof authRateLimit;

/** Counts one attempt in every bucket; returns the longest wait any exhausted bucket imposes. */
export async function checkLoginThrottle(ip: string, rawEmail: string, limiter: Limiter = authRateLimit) {
  const email = rawEmail.toLowerCase().trim();
  const scopes = loginThrottleScopes(ip, email);
  const client = await limiter(scopes.client, LOGIN_LIMITS.client);
  const ipLimit = await limiter(scopes.ip, LOGIN_LIMITS.ip);
  // An empty address has no account to protect; the other buckets still apply.
  const account = email ? await limiter(scopes.account, LOGIN_LIMITS.account) : { ok: true, remaining: LOGIN_LIMITS.account.limit };
  if (!account.ok) return { ok: false as const, retryAfterSeconds: LOGIN_LIMITS.account.windowMs / 1000, remaining: 0 };
  if (!client.ok || !ipLimit.ok) return { ok: false as const, retryAfterSeconds: LOGIN_LIMITS.client.windowMs / 1000, remaining: client.remaining };
  return { ok: true as const, retryAfterSeconds: 0, remaining: client.remaining };
}
