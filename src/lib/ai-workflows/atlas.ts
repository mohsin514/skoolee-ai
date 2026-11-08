import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuthUser } from "@/lib/auth";
import { entriesForRole } from "./registry";
import { checkCapabilityAccess } from "./registry/gates";
import type { CapabilityContext, Locale } from "./registry/types";

/**
 * "What AI can do for you": the honest count of connected capabilities against everything the role
 * can do in the app (the audited inventory), and the connected ones grouped by how they finish.
 */
export interface Atlas {
  connected: number; total: number;
  runs: Array<{ key: string; title: string }>;
  confirm: Array<{ key: string; title: string }>;
  approval: Array<{ key: string; title: string; roles: readonly string[] }>;
  unavailable: Array<{ key: string; title: string; whoCan: readonly string[] }>;
}

let inventory: Array<{ key: string; roles: string[] }> | null = null;
async function inventoryRows() {
  inventory ??= JSON.parse(await readFile(join(process.cwd(), "src/lib/ai-workflows/generated/inventory.json"), "utf8"));
  return inventory!;
}

export async function atlasFor(user: AuthUser, ctx: CapabilityContext, language: Locale): Promise<Atlas> {
  const rows = await inventoryRows();
  const total = rows.filter(row => row.roles.includes(user.role) || row.roles.includes("*")).length;
  const atlas: Atlas = { connected: 0, total, runs: [], confirm: [], approval: [], unavailable: [] };
  for (const entry of entriesForRole(user.role)) {
    if (["assistant.answer", "assistant.conversation"].includes(entry.key)) continue;
    const gate = await checkCapabilityAccess(ctx, entry);
    const item = { key: entry.key, title: entry.copy.title[language] };
    if (!gate.ok) { atlas.unavailable.push({ ...item, whoCan: gate.whoCan ?? [] }); continue; }
    atlas.connected++;
    if (entry.class === "A") atlas.runs.push(item);
    else if (entry.class === "B") atlas.confirm.push(item);
    else atlas.approval.push({ ...item, roles: entry.roles });
  }
  atlas.total = Math.max(atlas.total, atlas.connected);
  return atlas;
}
