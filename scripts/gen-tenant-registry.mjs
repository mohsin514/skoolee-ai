// ─────────────────────────────────────────────────────────────────
// Regenerates src/lib/db/tenant-models.ts from prisma/schema.prisma.
//
// The tenant guard (src/lib/db/prisma.ts) refuses to query any model it
// does not recognise, so this must be re-run whenever a model is added
// or removed:
//
//   node scripts/gen-tenant-registry.mjs
//
// A model is platform-global (exempt from school scoping) only if it is
// listed in GLOBAL below. Everything else is tenant-owned and must carry
// a `schoolId` column.
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Models that legitimately live outside any one school:
 *  - School            the tenant record itself
 *  - PlatformConfig    platform-wide settings, owner-only
 *  - PendingRegistration / PasswordReset   pre-authentication, keyed by email
 *  - SuperAdminAuditLog  platform-operator audit trail
 */
const GLOBAL = [
  "School",
  "PlatformConfig",
  "PendingRegistration",
  "PasswordReset",
  "SuperAdminAuditLog",
];

const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");

const models = [];
const modelBlock = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
let match;
while ((match = modelBlock.exec(schema))) {
  models.push({ name: match[1], body: match[2] });
}

const delegate = (name) => name.charAt(0).toLowerCase() + name.slice(1);

const missing = models
  .filter((m) => !GLOBAL.includes(m.name))
  .filter((m) => !/^\s*schoolId\s/m.test(m.body))
  .map((m) => m.name);

if (missing.length) {
  console.error(
    "These models are tenant-owned but have no schoolId field:\n  " +
      missing.join("\n  ") +
      "\n\nAdd `schoolId String @map(\"school_id\")` (plus a backfill migration), " +
      "or add the model to GLOBAL in this script if it really is platform-wide."
  );
  process.exit(1);
}

const tenant = models
  .map((m) => m.name)
  .filter((name) => !GLOBAL.includes(name))
  .map(delegate)
  .sort();

const globals = GLOBAL.map(delegate).sort();

const lines = [
  "// AUTO-GENERATED from prisma/schema.prisma by scripts/gen-tenant-registry.mjs.",
  "// Do not edit by hand — re-run the generator after changing the schema.",
  "//",
  "// Every model listed here carries a `schoolId` column and is subject to the",
  "// tenant guard in ./prisma.ts. Anything NOT listed here is platform-global and",
  "// is readable without tenant context (see GLOBAL_MODELS).",
  "",
  "export const TENANT_MODELS = new Set<string>([",
  ...tenant.map((name) => `  "${name}",`),
  "]);",
  "",
  "export const GLOBAL_MODELS = new Set<string>([",
  ...globals.map((name) => `  "${name}",`),
  "]);",
  "",
];

fs.writeFileSync(path.join(root, "src/lib/db/tenant-models.ts"), lines.join("\n"));
console.log(`tenant-models.ts: ${tenant.length} tenant models, ${globals.length} global`);
