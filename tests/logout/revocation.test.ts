/**
 * Does signing out actually revoke the token?
 *
 * The rest of the suite checks that the *browser* stops holding the cookie.
 * This one checks the other half, which is the half that matters if the cookie
 * ever leaked: a token captured before logout must stop being accepted.
 *
 * Without that, "sign out" only means "this browser forgot", and the row
 * LoginSession.isActive was already writing is decoration — nothing reads it,
 * so the "terminate session" controls in the owner and super consoles cannot do
 * what their labels say either.
 *
 * The probe is /api/auth/session, which is in PUBLIC_PATHS but still calls
 * getAuthUser(). That combination is deliberate: the proxy steps aside, so a
 * 401 can only come from the auth layer itself and never from a redirect the
 * proxy would have issued regardless of whether revocation works.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { describeTarget } from "../support/env";
import {
  createThrowawayUser,
  deleteThrowawayUsers,
  cleanupMintedSessions,
  disconnectDb,
  sessionRowsForToken,
  waitForSessionRows,
} from "../support/db";
import {
  TestClient,
  clientWithToken,
  login,
  logout,
  readJson,
  readPageOutcome,
  redirectPathname,
  waitForServer,
} from "../support/http";
import { fixtureFor, SESSION_PROBE_PATH } from "../support/accounts";
import { setCookie } from "../support/cookies";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

const fixture = fixtureFor("CAMPUS_ADMIN");

describe("token revocation", () => {
  before(async () => {
    console.log(`\n  ${describeTarget()}\n`);
    await waitForServer();
  });

  after(async () => {
    const removed = await deleteThrowawayUsers();
    if (removed) console.log(`\n  cleaned up ${removed} throwaway account(s)\n`);
    await cleanupMintedSessions();
    await disconnectDb();
  });

  it("the session probe accepts a live token", async () => {
    // Establishes that the probe reports on the session rather than simply
    // always answering 401 — otherwise the replay assertions below would pass
    // for the wrong reason.
    const client = new TestClient();
    await login(client, fixture.email, fixture.password);

    const response = await client.get(SESSION_PROBE_PATH);
    assert.equal(response.status, 200, "a live session is accepted by the probe");

    const body = await readJson(response);
    assert.equal(body?.user?.role, fixture.role, "the probe reports the signed-in role");
  });

  it("a token captured before logout is refused by the auth layer", async () => {
    const client = new TestClient();
    const { token } = await login(client, fixture.email, fixture.password);

    // What an attacker would have: the cookie value, copied while it was valid.
    const stolen = clientWithToken(token);
    const beforeLogout = await stolen.get(SESSION_PROBE_PATH);
    assert.equal(beforeLogout.status, 200, "the captured token works before logout");

    await logout(client);
    await waitForSessionRows(
      token,
      (rows) => rows.length > 0 && rows.every((r) => !r.isActive)
    );

    const afterLogout = await stolen.get(SESSION_PROBE_PATH);
    assert.equal(
      afterLogout.status,
      401,
      `a token replayed after logout must be refused, got ${afterLogout.status}. ` +
        `The JWT signature is still valid and its expiry is days away, so ` +
        `signature verification alone cannot catch this — the session row has ` +
        `to be consulted.`
    );
  });

  it("a token captured before logout is refused by protected APIs", async () => {
    const client = new TestClient();
    const { token } = await login(client, fixture.email, fixture.password);

    const stolen = clientWithToken(token);
    assert.equal(
      (await stolen.get(fixture.apiPath)).status,
      200,
      `${fixture.apiPath} works before logout`
    );

    await logout(client);
    await waitForSessionRows(
      token,
      (rows) => rows.length > 0 && rows.every((r) => !r.isActive)
    );

    const response = await stolen.get(fixture.apiPath);
    assert.equal(
      response.status,
      401,
      `${fixture.apiPath} must be 401 for a replayed token, got ${response.status}`
    );
  });

  it("a token captured before logout cannot render a console page", async () => {
    const client = new TestClient();
    const { token } = await login(client, fixture.email, fixture.password);

    const stolen = clientWithToken(token);
    assert.equal(
      (await stolen.get(fixture.guardedPagePath)).status,
      200,
      `${fixture.guardedPagePath} renders before logout`
    );

    await logout(client);
    await waitForSessionRows(
      token,
      (rows) => rows.length > 0 && rows.every((r) => !r.isActive)
    );

    const outcome = await readPageOutcome(await stolen.get(fixture.guardedPagePath));

    assert.equal(
      redirectPathname(outcome),
      "/login",
      `a replayed token on ${fixture.guardedPagePath} must send the client to ` +
        `/login, got ${outcome.summary}`
    );

    // And nothing of the console may have been rendered on the way. The
    // streamed case still returns 200, so this is what distinguishes "bounced
    // before rendering" from "rendered the console and then navigated away".
    assert.ok(
      outcome.visibleText.length < 200,
      `the console must not render for a replayed token, but the response ` +
        `carried ${outcome.visibleText.length} characters of text: ` +
        `${JSON.stringify(outcome.visibleText.slice(0, 200))}`
    );
  });

  it("re-minting the cookie leaves no unrevocable session behind", async () => {
    // The forced-password-change route issues a brand-new token and returns it
    // in the cookie, without recording a session row for it or closing the row
    // belonging to the token it replaced. Whatever the mechanism, the invariant
    // afterwards must hold: signing out leaves nothing open.
    const tempPassword = "TempPass1";
    const user = await createThrowawayUser({
      label: "remint",
      role: "TEACHER",
      password: tempPassword,
      mustChangePassword: true,
      onboardingComplete: true,
    });

    const client = new TestClient();
    const { token: originalToken } = await login(client, user.email, tempPassword);

    await waitForSessionRows(originalToken, (rows) => rows.length > 0);

    const changed = await client.request("/api/auth/first-password", {
      method: "PUT",
      body: { newPassword: "BrandNew2" },
    });
    assert.equal(
      changed.status,
      200,
      `first-password should succeed, got ${changed.status} ${JSON.stringify(
        await readJson(changed)
      )}`
    );

    const reminted = setCookie(changed, SESSION_COOKIE_NAME);
    assert.ok(reminted?.value, "first-password re-issues the session cookie");
    const newToken = reminted!.value;
    assert.notEqual(newToken, originalToken, "the re-issued token is a new one");

    await logout(client);

    // Give both writes a chance to land before taking stock.
    await waitForSessionRows(
      newToken,
      (rows) => rows.length > 0 && rows.every((r) => !r.isActive)
    );

    const originalRows = await sessionRowsForToken(originalToken);
    const newRows = await sessionRowsForToken(newToken);

    const stillOpen = [...originalRows, ...newRows].filter((r) => r.isActive);
    assert.deepEqual(
      stillOpen.map((r) => ({ id: r.id, tokenHash: r.tokenHash.slice(0, 12) })),
      [],
      `after a re-mint and a logout, ${stillOpen.length} session row(s) are ` +
        `still open. An open row nobody holds the token for can never be ` +
        `closed — it sits in the active-sessions panel permanently, and ` +
        `"terminate" cannot reach it.`
    );

    // And the re-minted token must itself be revocable, not merely absent.
    assert.ok(
      newRows.length > 0,
      `no session row was ever recorded for the re-minted token, so that ` +
        `session could not have been revoked even deliberately`
    );

    const stolen = clientWithToken(newToken);
    assert.equal(
      (await stolen.get(SESSION_PROBE_PATH)).status,
      401,
      "the re-minted token must also stop working after logout"
    );
  });
});
