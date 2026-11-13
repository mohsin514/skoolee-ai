/**
 * SKAI-143 — a sole group admin approves their own policy version (SD3 §2.5). The service records the typed reason;
 * the database check must not refuse that row, while still requiring a date, a review time and a named reviewer.
 * Reads the newest migration that defines the check so a later migration cannot silently restore the old clause.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dir = join(process.cwd(), "prisma", "migrations");
const latest = readdirSync(dir).sort().reverse()
  .map((name) => { try { return readFileSync(join(dir, name, "migration.sql"), "utf8"); } catch { return ""; } })
  .find((sql) => /ADD CONSTRAINT "policy_template_versions_check"/.test(sql));

test("the latest policy_template_versions check allows a sole admin's self-review", () => {
  assert.ok(latest, "a migration defines policy_template_versions_check");
  const check = latest!.slice(latest!.indexOf('ADD CONSTRAINT "policy_template_versions_check"'));
  assert.doesNotMatch(check.split(";")[0], /"reviewer_id"\s*<>\s*"submitted_by_id"/);
  for (const kept of ['"effective_from" IS NOT NULL', '"reviewed_at" IS NOT NULL', '"reviewer_id" IS NOT NULL', 'NOT ("locked_keys" && "overridable_keys")']) {
    assert.ok(check.includes(kept), `keeps ${kept}`);
  }
});

test("the service still refuses self-review unless the author is the only group admin and gives a reason", () => {
  const service = readFileSync(join(process.cwd(), "src", "lib", "group-policy", "service.ts"), "utf8");
  assert.match(service, /soleChecker\("policy", user, null\)/);
  assert.match(service, /SELF_APPROVAL_REASON_MIN/);
});
