/**
 * The 11-role logout matrix.
 *
 * One subtest per role in USER_ROLES, each walking the whole arc: sign in, be
 * accepted, sign out, be refused. Per-role rather than "one representative
 * role" because the consoles were built at different times and the redirect
 * rules differ between them — APP_OWNER and SUPER_ADMIN are moved off
 * /dashboard, PARENT's console is not behind the proxy at all — so a single
 * role passing says very little about the other ten.
 *
 * Every role's outcome is collected and printed as a table at the end, and a
 * redirect that deviates from the role's documented destination is reported
 * with the destination it actually reached rather than collapsed into "failed".
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { describeTarget } from "../support/env";
import {
  cleanupMintedSessions,
  disconnectDb,
  findUserByEmail,
  latestAuditLog,
  waitForSessionRows,
  type SessionRow,
} from "../support/db";
import { TestClient, login, logout, readJson, waitForServer } from "../support/http";
import { isCleared, setCookie } from "../support/cookies";
import { ROLE_FIXTURES, type RoleFixture } from "../support/accounts";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import type { UserRole } from "@/lib/roles";

interface RoleOutcome {
  role: UserRole;
  /** Status the guarded page returned while signed in. */
  signedInStatus: number | string;
  rowOpened: boolean;
  logoutOk: boolean;
  cookieCleared: boolean;
  rowClosed: boolean;
  /** What the guarded page did once signed out. */
  signedOutPage: string;
  signedOutApi: number | string;
  notes: string[];
}

const outcomes: RoleOutcome[] = [];

/**
 * Where a response actually went, as a short string for the table.
 * Redirects are reported with their Location so a deviation is visible.
 */
function describeResponse(response: Response): string {
  const location = response.headers.get("location");
  return location ? `${response.status} → ${location}` : String(response.status);
}

/** True when the response is the proxy sending an unauthenticated caller away. */
function redirectsToLogin(response: Response): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get("location") || "";
  try {
    return new URL(location, "http://placeholder").pathname === "/login";
  } catch {
    return false;
  }
}

function openRows(rows: SessionRow[]): SessionRow[] {
  return rows.filter((r) => r.isActive);
}

describe("logout matrix — all 11 roles", () => {
  before(async () => {
    console.log(`\n  ${describeTarget()}\n`);
    await waitForServer();
  });

  after(async () => {
    const header =
      `  role          signed-in  row-open  logout  cookie  row-closed  ` +
      `signed-out page                  api`;
    const rows = outcomes.map((o) => {
      const tick = (b: boolean) => (b ? "  ✓   " : "  ✗   ");
      return (
        `  ${o.role.padEnd(13)} ${String(o.signedInStatus).padEnd(10)}` +
        `${tick(o.rowOpened)}   ${tick(o.logoutOk)} ${tick(o.cookieCleared)} ` +
        `${tick(o.rowClosed)}     ${o.signedOutPage.padEnd(32)} ${o.signedOutApi}` +
        (o.notes.length ? `\n      ↳ ${o.notes.join("; ")}` : "")
      );
    });
    console.log(`\n${header}\n${rows.join("\n")}\n`);
    await cleanupMintedSessions();
    await disconnectDb();
  });

  for (const fixture of ROLE_FIXTURES) {
    it(`${fixture.role}: signs in, then logout revokes and locks out`, async () => {
      const outcome: RoleOutcome = {
        role: fixture.role,
        signedInStatus: "-",
        rowOpened: false,
        logoutOk: false,
        cookieCleared: false,
        rowClosed: false,
        signedOutPage: "-",
        signedOutApi: "-",
        notes: [],
      };
      outcomes.push(outcome);

      if (fixture.note) outcome.notes.push(fixture.note);

      const user = await findUserByEmail(fixture.email);
      assert.ok(user, `fixture account ${fixture.email} must exist`);

      // ── sign in ────────────────────────────────────────────────
      const client = new TestClient();
      const { token } = await login(client, fixture.email, fixture.password);

      const openedRows = await waitForSessionRows(token, (rows) =>
        openRows(rows).length > 0
      );
      outcome.rowOpened = openRows(openedRows).length > 0;
      assert.ok(
        outcome.rowOpened,
        `no open LoginSession row appeared for ${fixture.role} within the ` +
          `timeout. recordLoginSession() is fire-and-forget, so a missing row ` +
          `is possible by design — but on a local target it should land.`
      );

      // ── the session is accepted ────────────────────────────────
      const signedIn = await client.get(fixture.guardedPagePath);
      outcome.signedInStatus = describeResponse(signedIn);

      assert.ok(
        !redirectsToLogin(signedIn),
        `${fixture.role} was sent to /login while holding a fresh session ` +
          `(${outcome.signedInStatus})`
      );
      assert.notEqual(
        signedIn.status,
        401,
        `${fixture.role} got 401 on ${fixture.guardedPagePath} while signed in`
      );
      // A 5xx here means the console failed to render for reasons of its own.
      // Recorded, not fatal: the session was still accepted, which is the
      // property this suite is about.
      if (signedIn.status >= 500) {
        outcome.notes.push(
          `${fixture.guardedPagePath} returned ${signedIn.status} while signed in`
        );
      }

      // ── sign out ───────────────────────────────────────────────
      const logoutResponse = await logout(client);
      const logoutBody = await readJson(logoutResponse);

      outcome.logoutOk = logoutResponse.status === 200 && logoutBody?.success === true;
      assert.equal(logoutResponse.status, 200, "logout responds 200");
      assert.equal(logoutBody?.success, true, "logout responds { success: true }");

      const logoutCookie = setCookie(logoutResponse, SESSION_COOKIE_NAME);
      outcome.cookieCleared = isCleared(logoutCookie) && !client.jar.has(SESSION_COOKIE_NAME);
      assert.ok(logoutCookie, "logout sends a Set-Cookie for the session cookie");
      assert.ok(isCleared(logoutCookie), "logout clears the session cookie");
      assert.equal(
        client.sessionToken,
        undefined,
        "session cookie is gone from the jar"
      );

      // ── the row is closed ──────────────────────────────────────
      const closedRows = await waitForSessionRows(
        token,
        (rows) => rows.length > 0 && openRows(rows).length === 0
      );

      assert.ok(
        closedRows.length > 0,
        `the LoginSession row for ${fixture.role} vanished instead of being closed`
      );
      outcome.rowClosed = openRows(closedRows).length === 0;
      assert.equal(
        openRows(closedRows).length,
        0,
        `${fixture.role} still has ${
          openRows(closedRows).length
        } open LoginSession row(s) after logout — the token remains revocable ` +
          `only in theory`
      );

      for (const row of closedRows) {
        assert.ok(
          row.logoutAt instanceof Date,
          `closed row ${row.id} must record logoutAt`
        );
      }

      // ── locked out ─────────────────────────────────────────────
      const signedOutPage = await client.get(fixture.guardedPagePath);
      outcome.signedOutPage = describeResponse(signedOutPage);

      assert.ok(
        redirectsToLogin(signedOutPage),
        `${fixture.role} should be redirected to /login for ` +
          `${fixture.guardedPagePath} once signed out, got ${outcome.signedOutPage}`
      );
      assert.equal(
        signedOutPage.status,
        307,
        `the proxy's unauthenticated redirect should be 307, got ${signedOutPage.status}`
      );

      const location = new URL(
        signedOutPage.headers.get("location")!,
        "http://placeholder"
      );
      assert.equal(
        location.searchParams.get("redirect"),
        fixture.guardedPagePath,
        `the redirect should preserve the requested path so signing in returns ` +
          `the user to it`
      );

      const signedOutApi = await client.get(fixture.apiPath);
      outcome.signedOutApi = signedOutApi.status;
      assert.equal(
        signedOutApi.status,
        401,
        `${fixture.apiPath} should be 401 once signed out, got ${signedOutApi.status}`
      );
    });
  }

  it("logout is idempotent: no cookie, no crash", async () => {
    const client = new TestClient();

    const first = await logout(client);
    assert.equal(first.status, 200, "logout with no cookie still responds 200");
    assert.equal(
      (await readJson(first))?.success,
      true,
      "logout with no cookie reports success"
    );

    // And twice over from a real session, which is what a double-click does.
    const signedIn = new TestClient();
    const fixture = ROLE_FIXTURES[0];
    await login(signedIn, fixture.email, fixture.password);

    const one = await logout(signedIn);
    const two = await logout(signedIn);

    assert.equal(one.status, 200, "first logout responds 200");
    assert.equal(two.status, 200, "second logout responds 200");
    assert.equal(
      (await readJson(two))?.success,
      true,
      "a repeated logout reports success rather than erroring"
    );
  });

  it("SUPER_ADMIN logout is written to the audit log", async () => {
    const fixture = ROLE_FIXTURES.find((f) => f.role === "SUPER_ADMIN")!;
    const user = await findUserByEmail(fixture.email);
    assert.ok(user, "the SUPER_ADMIN fixture must exist");

    const before = await latestAuditLog(user!.id, "logout");

    const client = new TestClient();
    await login(client, fixture.email, fixture.password);
    await logout(client);

    // Fire-and-forget, like the session row, so give it a moment to land.
    let entry = await latestAuditLog(user!.id, "logout");
    const deadline = Date.now() + 5_000;
    while (
      Date.now() < deadline &&
      (!entry || (before && entry.id === before.id))
    ) {
      await new Promise((r) => setTimeout(r, 100));
      entry = await latestAuditLog(user!.id, "logout");
    }

    assert.ok(entry, "a logout audit row should exist for the SUPER_ADMIN");
    assert.notEqual(
      entry!.id,
      before?.id,
      "logout should append a NEW audit row, not reuse the previous one"
    );
    assert.equal(entry!.status, "success", "the audit row records success");
  });
});
