/**
 * The cookie contract: what login creates, logout must destroy in kind.
 *
 * A browser decides whether an incoming cookie *replaces* an existing one by
 * comparing name, domain and path — the other attributes are not part of that
 * match. So a tear-down that omits HttpOnly and SameSite does still work today.
 * The reason to assert on them anyway is that nothing at the logout call site
 * recorded which attributes were load-bearing and which were incidental. The
 * two sites were written independently and drifted, and the next edit to either
 * has no way to know it must not change Path. Pinning the mirror makes the
 * relationship between the two sites explicit and checkable.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { describeTarget, resolveTarget } from "../support/env";
import { cleanupMintedSessions, disconnectDb } from "../support/db";
import { TestClient, login, logout, waitForServer } from "../support/http";
import { isCleared, setCookie, type ParsedCookie } from "../support/cookies";
import { fixtureFor } from "../support/accounts";
import { SESSION_COOKIE_NAME, SESSION_DAYS } from "@/lib/auth/session-cookie";

const fixture = fixtureFor("TEACHER");

/** Attributes every issue and every tear-down of the cookie must carry. */
function assertCanonicalAttributes(cookie: ParsedCookie, label: string) {
  const target = resolveTarget();

  assert.equal(cookie.httpOnly, true, `${label}: must be HttpOnly`);
  assert.equal(cookie.path, "/", `${label}: Path must be "/"`);
  assert.equal(cookie.sameSite, "lax", `${label}: SameSite must be Lax`);
  assert.equal(
    cookie.secure,
    target.https,
    `${label}: Secure must be ${target.https} for a ${
      target.https ? "https" : "http"
    } target`
  );
}

describe("session cookie contract", () => {
  before(async () => {
    console.log(`\n  ${describeTarget()}\n`);
    await waitForServer();
  });

  after(async () => {
    await cleanupMintedSessions();
    await disconnectDb();
  });

  it("login issues the cookie with the canonical attributes", async () => {
    const client = new TestClient();
    const { cookie } = await login(client, fixture.email, fixture.password);

    assert.ok(cookie.value.length > 0, "cookie carries a token");
    assert.equal(
      cookie.value.split(".").length,
      3,
      "cookie value is a three-part JWT"
    );
    assertCanonicalAttributes(cookie, "login");

    assert.equal(
      cookie.maxAge,
      60 * 60 * 24 * SESSION_DAYS.default,
      `login without rememberMe should last ${SESSION_DAYS.default} days`
    );
  });

  it("login honours rememberMe in the cookie lifetime", async () => {
    const client = new TestClient();
    const { cookie } = await login(client, fixture.email, fixture.password, {
      rememberMe: true,
    });

    assertCanonicalAttributes(cookie, "login (rememberMe)");
    assert.equal(
      cookie.maxAge,
      60 * 60 * 24 * SESSION_DAYS.remembered,
      `login with rememberMe should last ${SESSION_DAYS.remembered} days`
    );
  });

  it("logout clears the cookie", async () => {
    const client = new TestClient();
    await login(client, fixture.email, fixture.password);

    const response = await logout(client);
    assert.equal(response.status, 200, "logout responds 200");

    const cookie = setCookie(response, SESSION_COOKIE_NAME);
    assert.ok(cookie, "logout sends a Set-Cookie for the session cookie");
    assert.ok(isCleared(cookie), `logout must clear the cookie, got: ${cookie!.raw}`);

    // The jar models a browser, so this is the property that actually matters
    // to a user: after logout the cookie is gone from the client.
    assert.equal(
      client.sessionToken,
      undefined,
      "session cookie is gone from the jar after logout"
    );
  });

  it("logout mirrors the attributes login used to set the cookie", async () => {
    const client = new TestClient();
    const { cookie: loginCookie } = await login(
      client,
      fixture.email,
      fixture.password
    );

    const response = await logout(client);
    const logoutCookie = setCookie(response, SESSION_COOKIE_NAME);
    assert.ok(logoutCookie, "logout sends a Set-Cookie");

    assertCanonicalAttributes(logoutCookie!, "logout");

    // Stated as a direct comparison as well, so a future change to login's
    // attributes fails here rather than silently desynchronising the pair.
    for (const attr of ["httpOnly", "secure", "sameSite", "path"] as const) {
      assert.deepEqual(
        logoutCookie![attr],
        loginCookie[attr],
        `logout's ${attr} must match login's (login=${String(
          loginCookie[attr]
        )}, logout=${String(logoutCookie![attr])})`
      );
    }

    assert.equal(logoutCookie!.maxAge, 0, "logout expires the cookie immediately");
  });
});
