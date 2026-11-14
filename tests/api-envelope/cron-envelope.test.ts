import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1207 batch 1: the cron routes adopt the SKAI-1163 envelope (ok/fail) and keep their cron-secret guard.
const CRON_ROUTES = [
  "src/app/api/cron/group-policy/route.ts",
  "src/app/api/cron/meeting-reminders/route.ts",
  "src/app/api/cron/integrations/route.ts",
  "src/app/api/cron/conversation-retention/route.ts",
  "src/app/api/cron/drop-purge/route.ts",
  "src/app/api/cron/family-digests/route.ts",
  "src/app/api/cron/service-desk/route.ts",
];

test("cron routes import the envelope helpers and drop legacy bodies", () => {
  for (const file of CRON_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /import \{[^}]*\bok\b[^}]*\} from "@\/lib\/api\/envelope"/, file);
    assert.match(source, /import \{[^}]*\bfail\b[^}]*\} from "@\/lib\/api\/envelope"/, file);
    assert.doesNotMatch(source, /\{ error: "/, file);
    assert.doesNotMatch(source, /success: true/, file);
    assert.match(source, /req\.headers\.get\("authorization"\) !== `Bearer \$\{CRON_SECRET\}`\) return fail\("UNAUTHORIZED"/, file);
  }
});

test("cron routes keep the production not-configured guard as a 503", () => {
  for (const file of CRON_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /fail\("INTERNAL", "Cron not configured", undefined, 503\)/, file);
  }
});
