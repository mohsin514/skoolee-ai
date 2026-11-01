import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/lib/purchasing/service.ts", "utf8");
const save = source.slice(source.indexOf("export async function saveRequest"), source.indexOf("const current = await tx.purchaseRequest.findFirst"));

test("SKAI-1465: new purchase drafts take a per-campus lock before numbering", () => {
  const lock = save.indexOf("pg_advisory_xact_lock(hashtext(${`purchase-po:${campusId}`}))");
  assert.ok(lock > 0, "campus-scoped advisory lock");
  assert.ok(lock < save.indexOf("purchaseRequest.count({ where: { campusId } })"));
  assert.ok(save.indexOf("purchaseRequest.count(") < save.indexOf("poNumber: `PO-"));
});
