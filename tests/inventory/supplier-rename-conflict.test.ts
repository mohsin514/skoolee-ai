import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1687: renaming a supplier enforces the same per-campus name policy as create.
const source = readFileSync("src/app/api/inventory/suppliers/route.ts", "utf8");
const patch = source.slice(source.indexOf("export async function PATCH"), source.indexOf("export async function DELETE"));

test("a rename is serialised on the same campus lock as create, before the name check and update", () => {
  const lock = patch.indexOf("pg_advisory_xact_lock(hashtext(${`inventory-supplier:${campusId}`}))");
  const lookup = patch.indexOf('tx.supplier.findFirst({ where: { campusId, id: { not: id }, name: { equals: name, mode: "insensitive" } }');
  const update = patch.indexOf("tx.supplier.update(");
  assert.ok(lock > 0 && lookup > lock && update > lookup);
});

test("a rename into another supplier's name is a 409 and nothing is written", () => {
  assert.match(patch, /if \(clash\) throw new ApiError\("A supplier with this name already exists", 409\);\n\s*\}\n\s*return tx\.supplier\.update/);
});

test("the supplier is looked up in the caller's campus only", () => {
  assert.match(patch, /prisma\.supplier\.findFirst\(\{ where: \{ id, campusId \} \}\)/);
});
