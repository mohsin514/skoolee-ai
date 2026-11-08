/**
 * Parses the audited capability inventory (plan Appendix A) into JSON the registry lint and the
 * coverage report read. The markdown stays the human source; this file is regenerated, never edited.
 *   npx tsx scripts/ai-workflows/inventory-to-json.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SOURCE = "docs/product-review-2026-10/ai-automation-plan-2026-10-23/appendix-a-capability-inventory.md";
export const INVENTORY_JSON = "src/lib/ai-workflows/generated/inventory.json";

export interface InventoryRow {
  key: string; cluster: string; route: string; method: string; roles: string[]; risk: string;
  idempotent: string; aiToday: string; reuse: string; addedByVerifier: boolean; source: "appendix-a" | "existing-tool";
}

/** Existing automation tools and server actions that are not route rows in Appendix A (plan design-slices §0.2). */
const EXISTING_TOOLS: Array<Pick<InventoryRow, "key" | "cluster" | "route" | "roles" | "risk">> = [
  { key: "personal.save_plan", cluster: "PERSONAL", route: "automation tool", roles: ["*"], risk: "CREATE" },
  { key: "profile.update", cluster: "PERSONAL", route: "automation tool", roles: ["*"], risk: "UPDATE" },
  { key: "work.save", cluster: "PERSONAL", route: "automation tool", roles: ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"], risk: "CREATE" },
  { key: "campus.create", cluster: "C8 Platform, group governance and onboarding", route: "server action src/app/actions/addCampus.ts", roles: ["SUPER_ADMIN"], risk: "CREATE" },
  { key: "campus.update_details", cluster: "C8 Platform, group governance and onboarding", route: "server action src/app/actions/settings.ts", roles: ["SUPER_ADMIN", "ADMIN"], risk: "UPDATE" },
  { key: "platform.update_institution", cluster: "C8 Platform, group governance and onboarding", route: "automation tool", roles: ["APP_OWNER"], risk: "UPDATE" },
];

const ROLE = /^(APP_OWNER|SUPER_ADMIN|ADMIN|CAMPUS_ADMIN|PRINCIPAL|TEACHER|ACCOUNTANT|LIBRARIAN|RECEPTIONIST|STUDENT|PARENT)$/;

export function parseInventory(markdown: string): InventoryRow[] {
  const rows = new Map<string, InventoryRow>();
  let cluster = "";
  for (const line of markdown.split("\n")) {
    const heading = /^## (C\d+[a-z]?[^—]*?)(?: —|$)/.exec(line);
    if (heading) { cluster = heading[1].trim(); continue; }
    if (!line.startsWith("| ") || !line.includes("`")) continue;
    // Escaped pipes inside notes are not column separators.
    const cells = line.replace(/\\\|/g, "\u0000").split("|").slice(1, -1).map(cell => cell.replace(/\u0000/g, "|").trim());
    const keyMatch = /^(⚑ )?`([^`]+)`$/.exec(cells[0] ?? "");
    const routeMatch = /^`(\S+) (.+)`$/.exec(cells[1] ?? "");
    if (!keyMatch || !routeMatch || !cluster) continue;
    // Main tables: key|route|roles|risk|approval|idem|ai|reuse|notes. C9 supplement: key|route|roles|risk|idem|ai|reuse|owner|notes.
    const supplement = /^C9/.test(cluster);
    const [risk, idempotent, aiToday, reuse] = supplement ? [cells[3], cells[4], cells[5], cells[6]] : [cells[3], cells[5], cells[6], cells[7]];
    const key = keyMatch[2];
    const row: InventoryRow = {
      key, cluster, method: routeMatch[1], route: routeMatch[2],
      roles: (cells[2] ?? "").split(",").map(role => role.trim()).filter(role => ROLE.test(role)),
      risk, idempotent, aiToday, reuse, addedByVerifier: Boolean(keyMatch[1]), source: "appendix-a",
    };
    // Clusters overlap in places (critic finding); the first owner wins, later duplicates add their roles.
    const previous = rows.get(key);
    if (previous) previous.roles = [...new Set([...previous.roles, ...row.roles])];
    else rows.set(key, row);
  }
  for (const tool of EXISTING_TOOLS) if (!rows.has(tool.key)) rows.set(tool.key, { ...tool, method: "TOOL", idempotent: "yes", aiToday: "partial", reuse: "direct", addedByVerifier: false, source: "existing-tool" });
  return [...rows.values()].sort((a, b) => a.cluster.localeCompare(b.cluster) || a.key.localeCompare(b.key));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = parseInventory(readFileSync(SOURCE, "utf8"));
  mkdirSync(dirname(INVENTORY_JSON), { recursive: true });
  writeFileSync(INVENTORY_JSON, JSON.stringify(rows, null, 1) + "\n");
  console.log(`${rows.length} capabilities → ${INVENTORY_JSON}`);
}
