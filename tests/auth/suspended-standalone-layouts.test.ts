// SKAI-1659: a standalone workspace stops rendering on the next request after its school is suspended, even when
// the token was minted while the school was ACTIVE. Billing, account and recovery routes are not in that set.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { redirectIfSuspended } from "../../src/lib/auth/require-page-session";
import type { AuthUser } from "../../src/lib/auth";

const STANDALONE = "resources activities care corrections curriculum exam-delivery improvement jobs librarian messages parent pupils receptionist search service-desk setup student teacher transport".split(" ");
const RECOVERY = ["billing", "account", "subscription", "subscription-suspended"];
const user = (overrides: Partial<AuthUser>): AuthUser => ({ userId: "u", schoolId: "s", campusId: "c", role: "TEACHER", email: "t@example.invalid", fullName: "Synthetic", accessVersion: 0, schoolStatus: "ACTIVE", ...overrides } as AuthUser);
const redirectTarget = (fn: () => void) => {
  try { fn(); return null; } catch (error) { return String((error as { digest?: string }).digest ?? error); }
};

test("a suspended school redirects a standalone workspace to /subscription-suspended, even on a stale token", () => {
  // getAuthUser() reads the school status from the database, so a token minted while ACTIVE still arrives SUSPENDED.
  const target = redirectTarget(() => redirectIfSuspended(user({ role: "TEACHER", schoolStatus: "SUSPENDED" })));
  assert.match(target ?? "", /subscription-suspended/u);
});

test("an active school and the platform operator are not redirected", () => {
  assert.equal(redirectTarget(() => redirectIfSuspended(user({ schoolStatus: "ACTIVE" }))), null);
  assert.equal(redirectTarget(() => redirectIfSuspended(user({ role: "APP_OWNER", schoolStatus: "SUSPENDED" }))), null);
});

test("every standalone workspace layout calls the suspension redirect right after its session check", () => {
  for (const name of STANDALONE) {
    const source = readFileSync(`src/app/${name}/layout.tsx`, "utf8");
    assert.match(source, /const user = await requirePageSession\(\);\n\s*redirectIfSuspended\(user\);/u, `${name} must redirect a suspended school`);
  }
});

test("recovery and account routes do not use the suspension redirect", () => {
  for (const name of RECOVERY) {
    const source = readFileSync(`src/app/${name}/layout.tsx`, "utf8");
    assert.doesNotMatch(source, /redirectIfSuspended/u, `${name} must stay reachable while suspended`);
  }
});
