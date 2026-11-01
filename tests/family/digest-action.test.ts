import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { runDigestAction } from "../../src/lib/family/digest-action";

// SKAI-1455: a committed PATCH is never reported as unsaved because the follow-up GET failed.
const failure = (message: string, status: number) => Object.assign(new Error(message), { status });

describe("digest action: committed change, failed refresh", () => {
  for (const action of ["edit", "approve", "schedule", "send"]) {
    test(`${action}: PATCH succeeds and GET fails, so the outcome stays committed`, async () => {
      let refreshCalls = 0;
      const outcome = await runDigestAction({
        mutate: async () => ({ delivered: action === "send" ? 12 : 0 }),
        refresh: async () => { refreshCalls++; throw failure("boom", 500); },
      });
      assert.equal(outcome.committed, true, "a committed PATCH must not be reported as unsaved");
      assert.equal(refreshCalls, 1);
      assert.ok(outcome.committed && outcome.refreshed === false);
      assert.equal(outcome.committed && outcome.refreshStatus, 500);
    });
  }

  test("a successful PATCH and GET is committed and refreshed", async () => {
    const outcome = await runDigestAction({ mutate: async () => ({ version: 3 }), refresh: async () => undefined });
    assert.deepEqual(outcome, { committed: true, result: { version: 3 }, refreshed: true });
  });
});

describe("digest action: mutation refused", () => {
  test("a concurrent version change (409) is not committed and the view is still re-read", async () => {
    let refreshCalls = 0;
    const outcome = await runDigestAction({
      mutate: async () => { throw failure("This digest changed since you opened it. Review the new version.", 409); },
      refresh: async () => { refreshCalls++; },
    });
    assert.equal(outcome.committed, false);
    assert.equal(outcome.committed === false && outcome.status, 409);
    assert.equal(refreshCalls, 1);
  });

  test("a denied role (403) is not committed and the outcome does not depend on the re-read", async () => {
    const outcome = await runDigestAction({
      mutate: async () => { throw failure("Only the class teacher can send this update", 403); },
      refresh: async () => { throw failure("forbidden", 403); },
    });
    assert.equal(outcome.committed, false);
    assert.equal(outcome.committed === false && outcome.status, 403);
  });

  test("an expired session (401) is not committed and surfaces its status for the session message", async () => {
    const outcome = await runDigestAction({
      mutate: async () => { throw failure("Unauthorized", 401); },
      refresh: async () => { throw failure("Unauthorized", 401); },
    });
    assert.equal(outcome.committed === false && outcome.status, 401);
  });
});
