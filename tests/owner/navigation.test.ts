import assert from "node:assert/strict";
import test from "node:test";
import { PLATFORM_OWNER_AI_PAGES, roleGuardRedirect } from "@/lib/roles";
import { safeReturnPath } from "@/lib/auth/return-path";
import { requestHasSameOrigin } from "@/lib/auth/same-origin-policy";

test("owner workflow destinations survive both the proxy and sign-in return validation", () => {
  for (const page of PLATFORM_OWNER_AI_PAGES) {
    assert.equal(roleGuardRedirect("APP_OWNER", page), null);
    assert.equal(roleGuardRedirect("APP_OWNER", page + "/"), null);
    assert.equal(safeReturnPath(`${page}?try=platform.pilot_create#details`, "APP_OWNER"), `${page}?try=platform.pilot_create#details`);
  }
});

test("workflow navigation does not admit school assessments or prefix lookalikes", () => {
  for (const page of ["/ai/studio", "/ai/exams", "/ai/exams/student-attempt", "/ai/pilot-ledger", "/ai/can-do-extra", "/ai/setup/unknown", "/admin"]) {
    assert.equal(roleGuardRedirect("APP_OWNER", page), "/owner");
    assert.equal(safeReturnPath(page, "APP_OWNER"), null);
  }
});

const req = (origin: string, host = "127.0.0.1:3000", site = "same-origin") => new Request("http://localhost:3000/api/auth/mfa", { headers: { origin, host, "sec-fetch-site": site } });
test("development loopback normalization preserves the original request origin", () => {
  assert.equal(requestHasSameOrigin(req("http://127.0.0.1:3000"), true), true);
  assert.equal(requestHasSameOrigin(req("http://[::1]:3000", "[::1]:3000"), true), true);
  assert.equal(requestHasSameOrigin(req("http://localhost:3000", "localhost:3000"), false), true);
});

test("origin recovery never trusts another port, scheme, host, forwarded header, or cross-site request", () => {
  for (const r of [req("http://127.0.0.1:3001", "127.0.0.1:3001"), req("https://127.0.0.1:3000"), req("http://evil.example:3000", "evil.example:3000"), req("http://127.0.0.1:3000", "evil.example:3000"), req("http://127.0.0.1:3000", "127.0.0.1:3000", "cross-site"), req("null"), req("http://127.0.0.1:3000/path")]) assert.equal(requestHasSameOrigin(r, true), false);
  assert.equal(requestHasSameOrigin(req("http://127.0.0.1:3000"), false), false, "production remains strict");
});
