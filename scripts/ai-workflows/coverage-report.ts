/**
 * Writes current inventory coverage from the live capability registry. Historical aiToday
 * audit labels are not evidence that a capability is connected now.
 *   npx tsx scripts/ai-workflows/coverage-report.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { InventoryRow } from "./inventory-to-json";
import { INVENTORY_JSON } from "./inventory-to-json";

const REPORT = "src/lib/ai-workflows/generated/coverage.md";
const ROLES = ["APP_OWNER", "SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "STUDENT", "PARENT"];

export function coverageMarkdown(rows: InventoryRow[], connected: (row: InventoryRow, role?: string) => boolean) {
  const line = (label: string, subset: InventoryRow[], role?: string) => `| ${label} | ${subset.length} | ${subset.filter(row => connected(row, role)).length} |`;
  const byRole = ROLES.map(role => line(role, rows.filter(row => row.roles.includes(role) || row.roles.includes("*")), role));
  const clusters = [...new Set(rows.map(row => row.cluster))];
  const count = (field: keyof InventoryRow) => Object.entries(rows.reduce<Record<string, number>>((acc, row) => { const value = String(row[field]); acc[value] = (acc[value] ?? 0) + 1; return acc; }, {})).sort().map(([value, n]) => `${value} ${n}`).join(" · ");
  return [
    "# AI Workflows capability coverage (generated — do not edit)",
    "",
    `Total capabilities: **${rows.length}**; connected: **${rows.filter(row => connected(row)).length}**.`,
    "",
    `Risk: ${count("risk")}`, "", `Reuse: ${count("reuse")}`, "", `Idempotent: ${count("idempotent")}`, "",
    "## By role", "", "| Role | Capabilities | Connected |", "|---|---|---|", ...byRole, "",
    "## By cluster", "", "| Cluster | Capabilities | Connected |", "|---|---|---|", ...clusters.map(cluster => line(cluster, rows.filter(row => row.cluster === cluster))), "",
  ].join("\n");
}

/** Count only an entry's explicitly mapped inventory keys and roles; exclusions are not connections. */
export function registryCoverage(entries: readonly { key: string; inventoryKeys: readonly string[]; roles: readonly string[] }[]) {
  const rolesByKey = new Map<string, Set<string>>();
  for (const entry of entries) for (const key of [entry.key, ...entry.inventoryKeys]) {
    const roles = rolesByKey.get(key) ?? new Set<string>();
    for (const role of entry.roles) roles.add(role);
    rolesByKey.set(key, roles);
  }
  return (row: InventoryRow, role?: string) => {
    const roles = rolesByKey.get(row.key);
    return Boolean(roles?.size && (role ? roles.has(role) : true));
  };
}

async function main() {
  const rows = JSON.parse(readFileSync(INVENTORY_JSON, "utf8")) as InventoryRow[];
  const { REGISTRY } = await import("../../src/lib/ai-workflows/registry");
  writeFileSync(REPORT, coverageMarkdown(rows, registryCoverage([...REGISTRY.values()])));
  console.log(`coverage → ${REPORT}`);
  const { prisma } = await import("../../src/lib/db/prisma");
  const { redis } = await import("../../src/lib/queue/connection");
  await prisma.$disconnect();
  redis.disconnect();
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error); process.exit(1); });
