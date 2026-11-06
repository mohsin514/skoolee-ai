import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-486: the role-ux page rewrite dropped the guardian's transfer consent card from the family home, so a
// receiving school's request could never be answered in the app (POST /api/family/transfers had no screen).
test("the family home renders the learning-transfer consent card", () => {
  const page = readFileSync(new URL("../../src/app/parent/page.tsx", import.meta.url), "utf8");
  assert.match(page, /import \{ FamilyTransferConsent \} from "@\/components\/learning\/learning-transfer";/);
  assert.match(page, /<FamilyTransferConsent \/>/);
});
