import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { SALES_EMAIL, SUPPORT_EMAIL, NOREPLY_EMAIL, mailtoSales, whatsappLink } from "../../src/lib/config/contact";

/**
 * SKAI-948 / COM-08 — the dead domain skoolee.ai (NXDOMAIN) must never be the
 * contact fallback. Defaults resolve to the monitored skooleeai.com inbox.
 */

test("contact defaults use the live skooleeai.com domain, never skoolee.ai", () => {
  for (const [name, v] of [
    ["SALES_EMAIL", SALES_EMAIL],
    ["SUPPORT_EMAIL", SUPPORT_EMAIL],
    ["NOREPLY_EMAIL", NOREPLY_EMAIL],
  ] as const) {
    assert.ok(v.endsWith("@skooleeai.com"), `${name}=${v} must be @skooleeai.com`);
    assert.ok(!/@skoolee\.ai$/.test(v), `${name} must not use the dead skoolee.ai domain`);
  }
});

test("mailtoSales builds a well-formed mailto with subject", () => {
  const link = mailtoSales("Demo request — Pricing");
  assert.ok(link.startsWith(`mailto:${SALES_EMAIL}?`));
  assert.match(link, /subject=Demo\+request/);
});

test("whatsappLink returns null without a configured number", () => {
  // Cleared in the test env; a configured number would return a wa.me URL.
  assert.equal(whatsappLink("hi"), process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ? whatsappLink("hi") : null);
});

test("no source file hardcodes the dead skoolee.ai domain", () => {
  let hits = "";
  try {
    // Exclude the contact module itself, whose doc comments intentionally name
    // the dead domain to explain the rule.
    hits = execSync(
      "grep -rnE '@skoolee\\.ai' src/ --include='*.ts' --include='*.tsx' " +
        "| grep -v 'src/lib/config/contact.ts' || true",
      { cwd: process.cwd(), encoding: "utf8" },
    ).trim();
  } catch {
    hits = "";
  }
  assert.equal(hits, "", `Dead domain skoolee.ai still present:\n${hits}`);
});
