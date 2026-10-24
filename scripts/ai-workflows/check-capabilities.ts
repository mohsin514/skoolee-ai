/**
 * npm run check:capabilities — the registry coverage lint (architecture §8.3). Fails when:
 *  1. an API write handler is not in the audited inventory and not in the baseline (a new write surface);
 *  2. the set of inventory keys that are neither registry entries nor exclusions grows (ratchet);
 *  3. a registry entry widens roles beyond its inventory rows;
 *  4. a registry source uses a never-safe pattern;
 *  5. the generated inventory is stale.
 * Entry shape, class floors, C-without-execute and EN/AR/UR copy are enforced by defineCapability at import.
 *   --update-baseline  rewrites the ratchet after a deliberate change (only shrinking is accepted in review)
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseInventory, INVENTORY_JSON, type InventoryRow } from "./inventory-to-json";
import { normaliseRoute, scanWriteHandlers } from "./scan-handlers";
import { REGISTRY, coveredInventoryKeys } from "../../src/lib/ai-workflows/registry";
import { exclusionFor } from "../../src/lib/ai-workflows/registry/exclusions";
import { NEVER_SAFE_PATTERNS, ALLOWED_SYNTHETIC_REQUEST_CALLEES } from "../../src/lib/ai-workflows/registry/never-safe";
import { examStudioViolation } from "../../src/lib/ai-workflows/registry/exam-studio";

const BASELINE = "src/lib/ai-workflows/generated/capability-baseline.json";
const APPENDIX = "docs/product-review-2026-10/ai-automation-plan-2026-10-23/appendix-a-capability-inventory.md";
interface Baseline { unmappedHandlers: string[]; unconnectedKeys: string[] }

export function evaluate() {
  const errors: string[] = [];
  const committed = readFileSync(INVENTORY_JSON, "utf8");
  const inventory = parseInventory(readFileSync(APPENDIX, "utf8"));
  if (JSON.stringify(JSON.parse(committed)) !== JSON.stringify(JSON.parse(JSON.stringify(inventory)))) errors.push("generated inventory.json is stale: run npx tsx scripts/ai-workflows/inventory-to-json.ts");

  const known = new Set(inventory.map(row => `${row.method} ${normaliseRoute(row.route)}`));
  // The engine's own endpoints start and drive jobs; they are not capabilities a role holds.
  const ENGINE_ROUTES = ["/api/ai-workflows", "/api/automation"];
  const unmappedHandlers = scanWriteHandlers().filter(handler => !ENGINE_ROUTES.some(prefix => handler.route === prefix || handler.route.startsWith(`${prefix}/`))).map(handler => `${handler.method} ${handler.route}`).filter(id => !known.has(id));

  const covered = coveredInventoryKeys();
  const unconnectedKeys = inventory.filter(row => !covered.has(row.key) && !exclusionFor(row.key)).map(row => row.key).sort();

  const rowsByKey = new Map<string, InventoryRow>(inventory.map(row => [row.key, row]));
  for (const entry of REGISTRY.values()) {
    const allowed = new Set(entry.inventoryKeys.flatMap(key => rowsByKey.get(key)?.roles ?? []));
    if (!allowed.size || allowed.has("*")) continue;
    const widened = entry.roles.filter(role => !allowed.has(role));
    if (widened.length) errors.push(`${entry.key}: roles ${widened.join(", ")} exceed the inventory (${[...allowed].join(", ")})`);
  }
  // Lint 14: Exam Studio's chain is linked to, never run from AI Workflows.
  for (const entry of REGISTRY.values()) { const problem = examStudioViolation(entry); if (problem) errors.push(problem); }

  const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? sources(path) : path.endsWith(".ts") ? [path] : []; });
  for (const file of [...sources("src/lib/ai-workflows/registry"), ...sources("src/lib/ai-workflows/adapters")]) {
    if (file.endsWith("never-safe.ts")) continue;
    const text = readFileSync(file, "utf8");
    // runUnscoped is allowed only in the APP_OWNER platform adapter, which states its reason.
    const allowed = (id: string) => (id === "next-request" && ALLOWED_SYNTHETIC_REQUEST_CALLEES.includes(file)) || (id === "unscoped" && file === "src/lib/ai-workflows/adapters/platform.ts");
    for (const rule of NEVER_SAFE_PATTERNS) if (rule.pattern.test(text) && !allowed(rule.id)) errors.push(`${file}: ${rule.why} (${rule.id})`);
  }
  return { errors, current: { unmappedHandlers, unconnectedKeys } satisfies Baseline };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { errors, current } = evaluate();
  if (process.argv.includes("--update-baseline")) { writeFileSync(BASELINE, JSON.stringify(current, null, 1) + "\n"); console.log(`baseline: ${current.unmappedHandlers.length} unmapped handlers, ${current.unconnectedKeys.length} unconnected keys`); }
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
  const grew = (now: string[], before: string[]) => now.filter(item => !before.includes(item));
  for (const handler of grew(current.unmappedHandlers, baseline.unmappedHandlers)) errors.push(`new write handler ${handler} has no inventory row: add a registry entry or exclusion`);
  for (const key of grew(current.unconnectedKeys, baseline.unconnectedKeys)) errors.push(`capability ${key} became unconnected`);
  const shrunk = baseline.unconnectedKeys.length - current.unconnectedKeys.length + baseline.unmappedHandlers.length - current.unmappedHandlers.length;
  if (errors.length) { console.error(errors.map(error => `✖ ${error}`).join("\n")); process.exit(1); }
  console.log(`✔ ${REGISTRY.size} registry entries; ${current.unconnectedKeys.length} capabilities not connected yet; ${current.unmappedHandlers.length} handlers awaiting inventory${shrunk > 0 ? `; ratchet can shrink by ${shrunk} (run with --update-baseline)` : ""}`);
  // Importing the registry loads Prisma and the queue client; their handles would keep the lint alive.
  process.exit(0);
}
