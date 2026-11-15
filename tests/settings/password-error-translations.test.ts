import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateUi } from "@/lib/locale/ui-messages";

const route = readFileSync("src/app/api/auth/change-password/route.ts", "utf8");
// SKAI-2017: the length check became the shared policy, whose messages come from reset-password-policy.
const policy = readFileSync("src/lib/auth/reset-password-policy.ts", "utf8");
const messages = [
  ...route.matchAll(/ApiError\("([^"]+)"/g),
  ...policy.matchAll(/(?:RESET_PASSWORD_UNMET =|return) "([^"]+)"/g),
].map(m => m[1]);

test("SKAI-1485: every change-password API error is translated for Arabic and Urdu", () => {
  assert.ok(messages.length >= 8, "found the route's error messages");
  for (const message of messages) {
    for (const language of ["ar", "ur"] as const) {
      const translated = translateUi(message, language);
      assert.notEqual(translated, message, `${language}: ${message}`);
      assert.match(translated, /[؀-ۿ]/, `${language} uses Arabic script: ${message}`);
    }
  }
});
