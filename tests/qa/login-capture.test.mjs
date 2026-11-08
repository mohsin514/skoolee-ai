// SKAI-1267: privileged MFA logins are a recognised state, not a failed capture.
import test from "node:test";
import assert from "node:assert/strict";
import { captureSession, cookieValue, totp, verdict } from "../../scripts/qa/login-capture.mjs";

const BASE = "http://qa.test";
const SECRET = "JBSWY3DPEHPK3PXP";

function reply(status, json, cookie) {
  return { ok: status < 400, status, json: async () => json, headers: { get: () => cookie || null } };
}

/** Minimal stand-in for /api/auth/login and /api/auth/mfa. */
function fakeServer({ mfaRequired = false, enrolled = false, active = true }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push({ path, method: init.method, action: body.action, cookie: init.headers.cookie, origin: init.headers.origin });
    if (path === "/api/auth/login") {
      if (!active) return reply(403, { error: "Account disabled" });
      if (!mfaRequired) return reply(200, { user: {} }, "skoolee_token=tok-plain; Path=/; HttpOnly");
      return reply(200, { mfaRequired: true }, "skoolee-mfa=ticket-1; Path=/, skoolee_token=; Path=/; Max-Age=0");
    }
    assert.equal(init.headers.cookie, "skoolee-mfa=ticket-1");
    if (init.method === "GET") return reply(200, { enrolled, resumeChallenge: false });
    const session = (t) => reply(200, { ok: true }, `skoolee_token=${t}; Path=/, skoolee-mfa=; Max-Age=0`);
    switch (body.action) {
      case "defer": return enrolled ? reply(400, { code: "invalid" }) : session("tok-deferred");
      case "setup": return reply(200, { secret: SECRET });
      case "verify-setup": return body.code === totp(SECRET) ? reply(200, { recoveryCodes: [] }) : reply(400, { code: "invalid" });
      case "acknowledge": return session("tok-enrolled");
      case "challenge": return body.code === totp(SECRET) ? session("tok-challenged") : reply(400, { code: "invalid" });
    }
    return reply(400, {});
  };
  return { fetchImpl, calls };
}

const run = (server, extra = {}) => captureSession({ base: BASE, email: "admin@qa-alpha.qa.local", password: "x", fetchImpl: server.fetchImpl, ...extra });

test("cookieValue ignores a cleared session cookie", () => {
  assert.equal(cookieValue("skoolee-mfa=t; Path=/, skoolee_token=; Max-Age=0", "skoolee_token"), null);
  assert.equal(cookieValue("skoolee-mfa=t; Path=/", "skoolee-mfa"), "t");
});

test("non-privileged login gets a token straight away", async () => {
  const r = await run(fakeServer({}));
  assert.deepEqual([r.loginAccepted, r.mfa, r.token], [true, "none", "tok-plain"]);
  assert.equal(verdict(r, true), "pass");
});

test("unenrolled privileged login defers MFA and is a pass, not a failure", async () => {
  const s = fakeServer({ mfaRequired: true });
  const r = await run(s);
  assert.deepEqual([r.loginAccepted, r.mfa, r.token, r.error], [true, "deferred", "tok-deferred", null]);
  assert.equal(verdict(r, true), "pass");
  assert.ok(s.calls.every((c) => c.origin === BASE), "same-origin header on every call");
});

test("enrol mode runs setup, verify-setup and acknowledge", async () => {
  const s = fakeServer({ mfaRequired: true });
  const r = await run(s, { mode: "enrol" });
  assert.deepEqual(s.calls.filter((c) => c.action).map((c) => c.action), ["setup", "verify-setup", "acknowledge"]);
  assert.deepEqual([r.mfa, r.token], ["enrolled", "tok-enrolled"]);
});

test("enrolled login completes the challenge when the secret is known", async () => {
  const r = await run(fakeServer({ mfaRequired: true, enrolled: true }), { secretFor: async () => SECRET });
  assert.deepEqual([r.mfa, r.token], ["challenged", "tok-challenged"]);
  assert.equal(verdict(r, true), "pass");
});

test("enrolled login without a secret is a labelled skip, never a failure", async () => {
  const r = await run(fakeServer({ mfaRequired: true, enrolled: true }));
  assert.equal(r.loginAccepted, true);
  assert.equal(r.mfa, "skipped");
  assert.match(r.mfaNote, /no TOTP secret/);
  assert.equal(verdict(r, true), "skipped");
});

test("a disabled account is still a rejected login", async () => {
  const r = await run(fakeServer({ active: false }));
  assert.equal(r.loginAccepted, false);
  assert.equal(verdict(r, false), "pass");
  assert.equal(verdict(r, true), "fail");
});

test("an MFA step that fails is reported as a failure with the step named", async () => {
  const r = await run(fakeServer({ mfaRequired: true, enrolled: true }), { secretFor: async () => "AAAAAAAAAAAAAAAA" });
  assert.equal(r.token, null);
  assert.match(r.error, /challenge → 400/);
  assert.equal(verdict(r, true), "fail");
});
