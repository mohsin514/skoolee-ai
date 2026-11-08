// Centralized JWT secret bytes. In production the fallback is never used —
// the app fails fast instead of signing tokens with a known default.
//
// AUTH_SECRET also derives the default key that encrypts stored authenticator
// secrets (see mfa-crypto.ts), so every deployment that shares a database must
// use the same value or MFA sign-in fails there.
const DEV_FALLBACK_SECRET = "dev-secret-change-me";

function resolveJwtSecret(): string {
  const secret = process.env.AUTH_SECRET;
  const production = process.env.NODE_ENV === "production";
  if (!secret) {
    if (production) {
      throw new Error("AUTH_SECRET is not set in production. Refusing to start.");
    }
    console.warn("[auth] AUTH_SECRET is not set; using the development fallback. Authenticator secrets stored by this process cannot be read by a deployment with a different AUTH_SECRET.");
    return DEV_FALLBACK_SECRET;
  }
  if (production && secret === DEV_FALLBACK_SECRET) {
    throw new Error("AUTH_SECRET is set to the development fallback in production. Refusing to start.");
  }
  return secret;
}

export const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret());
