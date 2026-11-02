import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1666: a failed invitation lookup on Home shows Retry and a direct link instead of stranding the guardian.
const source = readFileSync("src/app/parent/page.tsx", "utf8");

test("invitation lookup failures are recorded, not swallowed", () => {
  assert.doesNotMatch(source, /the banner is optional/);
  assert.match(source, /if \(!response\.ok \|\| !body\?\.success \|\| !Array\.isArray\(body\.invitations\)\) throw/);
  assert.match(source, /\.catch\(\(\) => \{ if \(live\) setInvitationsFailed\(true\); \}\)/);
  assert.match(source, /\}, \[invitationsAttempt\]\);/);
});

test("the no-child Home offers Try again and a direct Review invitations link", () => {
  const branch = source.slice(source.indexOf("if (noChildren) {"));
  assert.match(branch, /\{invitationsFailed \? \(/);
  assert.match(branch, /setInvitationsAttempt\(\(n\) => n \+ 1\)/);
  assert.match(branch, /<Link href="\/parent-invitations"/);
});
