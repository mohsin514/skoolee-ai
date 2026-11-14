#!/usr/bin/env node
// SKAI-1906 (DB-01): every `…Id` column that has no Prisma relation must be classified in prisma/id-columns.json,
// so a new column that silently points at another table (and can dangle or cross schools) fails CI.
//
//   node scripts/check-id-columns.mjs            exit 1 and list unclassified or stale entries
//   node scripts/check-id-columns.mjs --summary  also print how many columns are in each class
//
// Classes:
//   ref:<Model>  internal reference to <Model>; a school-pinned foreign key is still owed (DB-01 follow-ups)
//   ref:?        internal reference whose target table is not confirmed yet; confirm it before adding the key
//   external     value issued outside this database (Stripe, WhatsApp, a regulator, a client-generated key)
//   snapshot     log, event or receipt row that keeps the id after the target is gone; no key by design
//   polymorphic  points at one of several tables, chosen by a type or kind column beside it
//   opaque       a grouping or catalogue key that no table owns (for example a shared sibling UUID)
// A column that gains an @relation must leave the registry; the check reports it as stale.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));
const registryPath = fileURLToPath(new URL("../prisma/id-columns.json", import.meta.url));
const SCALAR = new Set(["String", "Int", "BigInt"]);
const CLASS = /^(ref:(\?|[A-Z]\w*)|external|snapshot|polymorphic|opaque)$/;

/** `Model.field` for every scalar `…Id` column that no @relation in its model uses. */
export function findUnrelatedIdColumns(schema) {
  const found = [];
  const block = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match;
  while ((match = block.exec(schema))) {
    const lines = match[2].split("\n").map((raw) => raw.replace(/\/\/.*$/, "").trim());
    const related = new Set();
    for (const line of lines) {
      const relation = line.match(/@relation\([^)]*fields:\s*\[([^\]]*)\]/);
      if (relation) for (const column of relation[1].split(",")) related.add(column.trim());
    }
    for (const line of lines) {
      const field = line.match(/^(\w+Id)\s+(\w+)(\?|\[\])?(\s|$)/);
      if (field && SCALAR.has(field[2]) && !field[3]?.startsWith("[") && !related.has(field[1])) found.push(`${match[1]}.${field[1]}`);
    }
  }
  return found;
}

/** Problems that make the registry disagree with the schema. */
export function checkIdColumns(schema, registry) {
  const columns = new Set(findUnrelatedIdColumns(schema));
  const models = new Set([...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]));
  const problems = [];
  for (const column of columns) if (!(column in registry)) problems.push(`${column}: not classified; add it to prisma/id-columns.json`);
  for (const [column, kind] of Object.entries(registry)) {
    if (!columns.has(column)) problems.push(`${column}: stale; it has a relation now or no longer exists, so remove it`);
    else if (!CLASS.test(kind)) problems.push(`${column}: unknown class "${kind}"`);
    else if (kind.startsWith("ref:") && kind !== "ref:?" && !models.has(kind.slice(4))) problems.push(`${column}: ${kind} names no model`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const problems = checkIdColumns(readFileSync(schemaPath, "utf8"), registry);
  if (problems.length) {
    console.error(`${problems.length} …Id column problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error("Classes are explained at the top of scripts/check-id-columns.mjs.");
  } else {
    console.log(`All ${Object.keys(registry).length} …Id columns without a relation are classified.`);
  }
  if (process.argv.includes("--summary")) {
    const counts = {};
    for (const kind of Object.values(registry)) {
      const key = kind.startsWith("ref:") && kind !== "ref:?" ? "ref:<Model>" : kind;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    console.log(counts);
  }
  process.exitCode = problems.length ? 1 : 0;
}
