/**
 * Harness smoke test.
 *
 * Answers the two questions every other suite in this directory assumes:
 * is the target actually there, and does it have all 11 role accounts? When
 * those are wrong, the downstream suites fail in ways that look like logout
 * bugs, so they get checked once, first, and loudly.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { describeTarget, resolveTarget } from "../support/env";
import { cleanupMintedSessions, disconnectDb, findUserByEmail } from "../support/db";
import { TestClient, waitForServer } from "../support/http";
import { ROLE_FIXTURES, FIXTURE_PASSWORD } from "../support/accounts";
import { USER_ROLES } from "@/lib/roles";

describe("harness", () => {
  before(async () => {
    console.log(`\n  ${describeTarget()}\n`);
    await waitForServer();
  });

  after(async () => {
    await cleanupMintedSessions();
    await disconnectDb();
  });

  it("resolves a target and reaches it", async () => {
    const target = resolveTarget();
    assert.ok(target.baseUrl.startsWith("http"), "baseUrl looks like a URL");

    const client = new TestClient();
    const response = await client.get("/login");
    assert.ok(
      response.status < 500,
      `GET /login should not be a server error, got ${response.status}`
    );
  });

  it("covers every role in USER_ROLES exactly once", () => {
    assert.equal(
      ROLE_FIXTURES.length,
      USER_ROLES.length,
      "one fixture per role in USER_ROLES"
    );

    const seen = new Set(ROLE_FIXTURES.map((f) => f.role));
    assert.equal(seen.size, ROLE_FIXTURES.length, "no duplicate roles");

    for (const role of USER_ROLES) {
      assert.ok(seen.has(role), `missing a fixture for ${role}`);
    }
  });

  it("has all 11 fixture accounts present and usable", async () => {
    const results: string[] = [];
    const problems: string[] = [];

    for (const fixture of ROLE_FIXTURES) {
      const user = await findUserByEmail(fixture.email);

      if (!user) {
        problems.push(`${fixture.role}: no such account (${fixture.email})`);
        results.push(`  ✗ ${fixture.role.padEnd(13)} MISSING`);
        continue;
      }

      const issues: string[] = [];
      if (user.role !== fixture.role) issues.push(`role is ${user.role}`);
      if (!user.isActive) issues.push("inactive");
      if (user.mustChangePassword) issues.push("mustChangePassword");
      if (!user.onboardingComplete) issues.push("onboarding incomplete");
      if (user.school?.status !== "ACTIVE") issues.push(`school ${user.school?.status}`);

      if (issues.length) {
        problems.push(`${fixture.role}: ${issues.join(", ")}`);
        results.push(`  ✗ ${fixture.role.padEnd(13)} ${issues.join(", ")}`);
      } else {
        results.push(
          `  ✓ ${fixture.role.padEnd(13)} ${fixture.email.padEnd(34)} → ${fixture.dashboardPath}`
        );
      }
    }

    const found = results.filter((r) => r.startsWith("  ✓")).length;
    console.log(
      `\n  ${found}/${ROLE_FIXTURES.length} accounts found\n${results.join("\n")}\n`
    );

    assert.deepEqual(
      problems,
      [],
      `fixture accounts are not usable. Password expected: ${FIXTURE_PASSWORD}. ` +
        `See docs/qa/TEST-ACCOUNTS.md.`
    );
  });
});
