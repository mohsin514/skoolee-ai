import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2200: own full name is capped at 120 characters on the server and in Account settings.
test("profile full name has a maximum length", () => {
  const route = readFileSync("src/app/api/profile/route.ts", "utf8");
  assert.match(route, /fullName\.length > 120\) throw new ApiError\("Full name must be 120 characters or fewer", 400\)/);
  const form = readFileSync("src/components/settings/ProfileSettingsSection.tsx", "utf8");
  assert.match(form, /id="settings-full-name" autoComplete="name" maxLength=\{120\}/);
});
