// ─────────────────────────────────────────────────────────────────
// SKAI-1267 — log one persona in through the real auth routes and report
// login acceptance, the MFA challenge and the authenticated session as
// separate facts.
//
// Privileged roles answer /api/auth/login with HTTP 200, mfaRequired:true and
// a skoolee-mfa ticket instead of skoolee_token. That is a recognised state,
// not a failure: we finish it the way a browser would, then expect the token.
//
//   not enrolled   → "defer" (default, leaves the account unenrolled) or
//                    setup → verify-setup → acknowledge when mode is "enrol"
//   enrolled       → challenge with a TOTP from secretFor(email)
//   enrolled, no secret available → skipped, labelled, never a failure
// ─────────────────────────────────────────────────────────────────
import crypto from "node:crypto";

export const SESSION_COOKIE = "skoolee_token";
export const MFA_COOKIE = "skoolee-mfa";

/** Non-empty value of a cookie in a Set-Cookie header (cleared cookies count as absent). */
export function cookieValue(setCookie, name) {
  const m = String(setCookie || "").match(new RegExp(`(?:^|[,;\\s])${name}=([^;,]*)`));
  return m && m[1] ? m[1] : null;
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function totp(secret, step = Math.floor(Date.now() / 30_000)) {
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const d = crypto.createHmac("sha1", key).update(counter).digest();
  const o = d[19] & 15;
  return String((d.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/**
 * @returns {Promise<{ status: number|null, loginAccepted: boolean, mfa: "none"|"deferred"|"enrolled"|"challenged"|"skipped",
 *   mfaNote: string|null, token: string|null, error: string|null }>}
 */
export async function captureSession({ base, email, password, fetchImpl = fetch, mode = "defer", secretFor = async () => null }) {
  const out = { status: null, loginAccepted: false, mfa: "none", mfaNote: null, token: null, error: null };
  const res = await fetchImpl(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  out.status = res.status;
  const body = await res.json().catch(() => ({}));
  const setCookie = res.headers.get("set-cookie");
  out.token = cookieValue(setCookie, SESSION_COOKIE);
  const ticket = cookieValue(setCookie, MFA_COOKIE);
  out.loginAccepted = res.ok && Boolean(out.token || (body.mfaRequired && ticket));
  if (!out.loginAccepted) { out.error = body.error || body.code || null; return out; }
  if (out.token) return out;

  // MFA ticket: every follow-up call carries it, like the browser would.
  const mfa = async (method, payload) => {
    const r = await fetchImpl(`${base}/api/auth/mfa`, {
      method,
      headers: { "content-type": "application/json", origin: base, cookie: `${MFA_COOKIE}=${ticket}` },
      body: payload ? JSON.stringify(payload) : undefined,
      redirect: "manual",
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`mfa ${payload?.action || "status"} → ${r.status} ${json.code || json.error || ""}`.trim());
    return { json, token: cookieValue(r.headers.get("set-cookie"), SESSION_COOKIE) };
  };

  try {
    const { json: state } = await mfa("GET");
    let done;
    if (state.enrolled || state.resumeChallenge) {
      const secret = await secretFor(email);
      if (!secret) { out.mfa = "skipped"; out.mfaNote = "enrolled; no TOTP secret available to the harness"; return out; }
      done = await mfa("POST", { action: "challenge", code: totp(secret) });
      out.mfa = "challenged";
    } else if (mode === "enrol") {
      const { json: setup } = await mfa("POST", { action: "setup" });
      await mfa("POST", { action: "verify-setup", code: totp(setup.secret) });
      done = await mfa("POST", { action: "acknowledge", acknowledged: true });
      out.mfa = "enrolled";
    } else {
      done = await mfa("POST", { action: "defer" });
      out.mfa = "deferred";
    }
    out.token = done.token;
    if (!out.token) out.error = `MFA ${out.mfa} returned no ${SESSION_COOKIE}`;
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}

/** Pass/fail for one persona. A labelled MFA skip is neither: it is reported on its own. */
export function verdict(result, expectedLogin) {
  if (result.loginAccepted !== expectedLogin) return "fail";
  if (!expectedLogin) return "pass";
  if (result.mfa === "skipped") return "skipped";
  return result.token ? "pass" : "fail";
}
