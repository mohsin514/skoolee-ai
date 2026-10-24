/**
 * Unit tests for the revocation decision.
 *
 * No server and no database: the lookup is injected, so every branch is
 * reachable directly. That matters most for the two branches an integration
 * test cannot reliably produce — a session with no row at all, and a database
 * that is refusing queries — which are exactly the branches where getting the
 * answer backwards would sign out every user at once.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  checkRevocation,
  decideRevocation,
  type SessionLookup,
} from "@/lib/auth/session-revocation";

/** Swallows the expected warning so a passing run stays readable. */
async function withSilencedWarnings<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = original;
  }
}

describe("decideRevocation", () => {
  it("treats an open row as not revoked", () => {
    assert.equal(decideRevocation([{ isActive: true }]), false);
  });

  it("treats a closed row as revoked", () => {
    assert.equal(decideRevocation([{ isActive: false }]), true);
  });

  it("treats no row as revoked", () => {
    // All issuing flows now await server-side session recording.
    assert.equal(decideRevocation([]), true);
  });

  it("is not revoked while ANY row for the hash is still open", () => {
    // tokenHash is indexed but not unique, so duplicates are possible. One
    // open row means the session is live.
    assert.equal(
      decideRevocation([{ isActive: false }, { isActive: true }]),
      false
    );
  });

  it("is revoked once every row for the hash is closed", () => {
    assert.equal(
      decideRevocation([{ isActive: false }, { isActive: false }]),
      true
    );
  });
});

describe("checkRevocation", () => {
  const hash = "a".repeat(64);

  it("passes the hash through to the lookup", async () => {
    const seen: string[] = [];
    const lookup: SessionLookup = async (tokenHash) => {
      seen.push(tokenHash);
      return [{ isActive: true }];
    };

    await checkRevocation(hash, lookup);
    assert.deepEqual(seen, [hash]);
  });

  it("reports revoked for a closed session", async () => {
    const lookup: SessionLookup = async () => [{ isActive: false }];
    assert.equal(await checkRevocation(hash, lookup), true);
  });

  it("reports not revoked for an open session", async () => {
    const lookup: SessionLookup = async () => [{ isActive: true }];
    assert.equal(await checkRevocation(hash, lookup), false);
  });

  it("reports revoked when there is no row", async () => {
    const lookup: SessionLookup = async () => [];
    assert.equal(await checkRevocation(hash, lookup), true);
  });

  it("fails closed when the database throws", async () => {
    const revoked = await withSilencedWarnings(() => checkRevocation(hash, async () => { throw new Error("database unavailable"); }));
    assert.equal(revoked, true, "Unavailable revocation state must not authorize a protected request");
  });

  it("warns when it fails closed, rather than degrading silently", async () => {
    const messages: unknown[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => messages.push(args[0]);

    try {
      await checkRevocation(hash, async () => {
        throw new Error("nope");
      });
    } finally {
      console.warn = original;
    }

    assert.equal(messages.length, 1, "exactly one warning is emitted");
    assert.match(
      String(messages[0]),
      /session verification/i,
      "the warning says what could not be determined"
    );
  });
});
