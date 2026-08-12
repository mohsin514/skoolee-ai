// Centralized JWT secret bytes. In production the fallback is never used —
// the app fails fast instead of signing tokens with a known default.
function resolveJwtSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is not set in production. Refusing to start.");
    }
    return "dev-secret-change-me";
  }
  return secret;
}

export const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret());
