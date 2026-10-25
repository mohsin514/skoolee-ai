import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { JWT_SECRET } from "@/lib/auth/secret";
import { checkDestination } from "@/lib/integrations/destination";

// SKO-446: the one supported protocol — OpenID Connect authorization code flow with PKCE (S256), a signed state
// cookie carrying state, nonce and verifier, and ID tokens verified against the issuer's JWKS for issuer,
// audience, expiry and nonce. Only HTTPS issuers, except hosts explicitly allowed for the isolated test.

export type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string; id_token_signing_alg_values_supported?: string[] };
const allowedTestIssuers = () => process.env.NODE_ENV === "production" ? [] : (process.env.IDENTITY_TEST_ALLOWED_ISSUERS ?? "").split(",").map(s => s.trim()).filter(Boolean);
const httpsOrTest = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" || (x.protocol === "http:" && allowedTestIssuers().includes(x.origin)); } catch { return false; } };
async function safeDestination(raw: string) {
  if (!httpsOrTest(raw)) return false;
  // Test-only HTTP issuers remain opt-in, but still go through the same DNS/IP
  // checks. Production never permits the exception.
  const url = new URL(raw);
  if (url.protocol === "http:" && allowedTestIssuers().includes(url.origin)) return true;
  const result = await checkDestination(raw);
  return result.ok;
}

/** Fetches and checks provider metadata: the issuer must match exactly and every endpoint must be HTTPS. */
export async function discover(issuer: string): Promise<{ ok: true; discovery: Discovery } | { ok: false; reason: string }> {
  const clean = issuer.replace(/\/$/, "");
  if (!(await safeDestination(clean))) return { ok: false, reason: "The issuer must be HTTPS and resolve to a public address." };
  let doc: Discovery;
  try {
    const r = await fetch(`${clean}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!r.ok) return { ok: false, reason: `The provider metadata could not be read (HTTP ${r.status}).` };
    doc = await r.json();
  } catch { return { ok: false, reason: "The provider metadata could not be reached." }; }
  if (doc.issuer?.replace(/\/$/, "") !== clean) return { ok: false, reason: `The metadata names a different issuer (${doc.issuer}).` };
  for (const k of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (!doc[k] || !(await safeDestination(doc[k]))) return { ok: false, reason: `The provider's ${k} is missing or resolves to a private address.` };
  }
  if (doc.id_token_signing_alg_values_supported && !doc.id_token_signing_alg_values_supported.some(a => ["RS256", "ES256", "PS256"].includes(a))) return { ok: false, reason: "The provider does not sign ID tokens with a supported algorithm (RS256, ES256, PS256)." };
  return { ok: true, discovery: doc };
}

const b64url = (b: Buffer) => b.toString("base64url");
export function pkce() { const verifier = b64url(randomBytes(32)); return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) }; }

export async function stateCookie(data: { connectionId: string; schoolId: string; state: string; nonce: string; verifier: string; redirectUri: string }) {
  return new SignJWT({ purpose: "sso", ...data }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(JWT_SECRET);
}
export async function readStateCookie(token: string) {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  if (payload.purpose !== "sso") throw new Error("bad state");
  return payload as unknown as { connectionId: string; schoolId: string; state: string; nonce: string; verifier: string; redirectUri: string };
}

export async function exchange(d: Discovery, p: { code: string; verifier: string; redirectUri: string; clientId: string; clientSecret: string | null }) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code: p.code, redirect_uri: p.redirectUri, client_id: p.clientId, code_verifier: p.verifier, ...(p.clientSecret ? { client_secret: p.clientSecret } : {}) });
  const r = await fetch(d.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(8000), redirect: "error" });
  if (!r.ok) throw new Error(`token endpoint answered ${r.status}`);
  const json = await r.json() as { id_token?: string };
  if (!json.id_token) throw new Error("no id_token");
  return json.id_token;
}

export async function verifyIdToken(d: Discovery, idToken: string, clientId: string, nonce: string) {
  const jwks = createRemoteJWKSet(new URL(d.jwks_uri));
  const { payload } = await jwtVerify(idToken, jwks, { issuer: d.issuer, audience: clientId, algorithms: ["RS256", "ES256", "PS256"], clockTolerance: 60 });
  if (payload.nonce !== nonce) throw new Error("nonce mismatch");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("no subject");
  return payload as { sub: string; email?: string; email_verified?: boolean; name?: string; [k: string]: unknown };
}
