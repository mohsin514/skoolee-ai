#!/usr/bin/env node
// SKAI-1806 (DB-01 Phase 0b): every foreign key needs an index whose leading columns are the FK columns.
// Postgres does not create one automatically, so without it joins and parent deletes scan the child table.
//
//   node scripts/check-fk-indexes.mjs            exit 1 and list the gaps
//   node scripts/check-fk-indexes.mjs --json     machine-readable list of gaps
//
// A foreign key counts as covered when its columns are a leading prefix of an @id, @unique, @@id, @@unique
// or @@index of the same model (in order).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));

export function findUnindexedForeignKeys(schema) {
  const models = new Map();
  let current = null;
  for (const raw of schema.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    const open = line.match(/^model (\w+) \{/);
    if (open) { current = { name: open[1], fks: [], keys: [] }; models.set(open[1], current); continue; }
    if (!current) continue;
    if (line === "}") { current = null; continue; }
    const block = line.match(/^@@(?:id|unique|index)\(\s*(?:fields:\s*)?\[([^\]]*)\]/);
    if (block) { current.keys.push(columns(block[1])); continue; }
    const field = line.match(/^(\w+)\s+\S+/);
    if (!field) continue;
    if (/@id\b|@unique\b/.test(line)) current.keys.push([field[1]]);
    const relation = line.match(/@relation\([^)]*fields:\s*\[([^\]]*)\]/);
    if (relation) current.fks.push({ field: field[1], columns: columns(relation[1]) });
  }
  const gaps = [];
  for (const model of models.values()) {
    for (const fk of model.fks) {
      const covered = model.keys.some((key) => fk.columns.every((column, i) => key[i] === column));
      if (!covered) gaps.push({ model: model.name, relation: fk.field, columns: fk.columns });
    }
  }
  return gaps;
}

function columns(list) {
  return list.split(",").map((c) => c.trim().replace(/\(.*$/, "")).filter(Boolean);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const gaps = findUnindexedForeignKeys(readFileSync(schemaPath, "utf8"));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(gaps, null, 2));
  } else if (gaps.length) {
    console.error(`${gaps.length} foreign key(s) have no index leading with their columns:`);
    for (const gap of gaps) console.error(`  ${gap.model}.${gap.relation} -> @@index([${gap.columns.join(", ")}])`);
    console.error("Add the @@index to the model in prisma/schema.prisma and a migration that creates it.");
  } else {
    console.log("Every foreign key has a supporting index.");
  }
  process.exitCode = gaps.length ? 1 : 0;
}
