/**
 * Writes the honest "connected to n of m" coverage report from the inventory JSON. Until the registry
 * lands (Slice 1c) "connected" means reachable by today's engine (aiToday partial/full).
 *   npx tsx scripts/ai-workflows/coverage-report.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { InventoryRow } from "./inventory-to-json";
import { INVENTORY_JSON } from "./inventory-to-json";

const REPORT = "src/lib/ai-workflows/generated/coverage.md";
const ROLES = ["APP_OWNER", "SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "STUDENT", "PARENT"];

export function coverageMarkdown(rows: InventoryRow[], connected: (row: InventoryRow) => boolean) {
  const line = (label: string, subset: InventoryRow[]) => `| ${label} | ${subset.length} | ${subset.filter(connected).length} |`;
  const byRole = ROLES.map(role => line(role, rows.filter(row => row.roles.includes(role) || row.roles.includes("*"))));
  const clusters = [...new Set(rows.map(row => row.cluster))];
  const count = (field: keyof InventoryRow) => Object.entries(rows.reduce<Record<string, number>>((acc, row) => { const value = String(row[field]); acc[value] = (acc[value] ?? 0) + 1; return acc; }, {})).sort().map(([value, n]) => `${value} ${n}`).join(" · ");
  return [
    "# AI Workflows capability coverage (generated — do not edit)",
    "",
    `Total capabilities: **${rows.length}**; connected: **${rows.filter(connected).length}**.`,
    "",
    `Risk: ${count("risk")}`, "", `Reuse: ${count("reuse")}`, "", `Idempotent: ${count("idempotent")}`, "",
    "## By role", "", "| Role | Capabilities | Connected |", "|---|---|---|", ...byRole, "",
    "## By cluster", "", "| Cluster | Capabilities | Connected |", "|---|---|---|", ...clusters.map(cluster => line(cluster, rows.filter(row => row.cluster === cluster))), "",
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = JSON.parse(readFileSync(INVENTORY_JSON, "utf8")) as InventoryRow[];
  writeFileSync(REPORT, coverageMarkdown(rows, row => row.aiToday === "partial" || row.aiToday === "full"));
  console.log(`coverage → ${REPORT}`);
}
