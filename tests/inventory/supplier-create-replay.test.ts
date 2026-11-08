import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1681: a retried supplier create replays the committed supplier instead of adding a duplicate.
const source = readFileSync("src/app/api/inventory/suppliers/route.ts", "utf8");
const post = source.slice(source.indexOf("export async function POST"), source.indexOf("export async function PATCH"));

test("creates are serialised per campus and check the name first", () => {
  const lock = post.indexOf("pg_advisory_xact_lock(hashtext(${`inventory-supplier:${campusId}`}))");
  const lookup = post.indexOf('tx.supplier.findFirst({ where: { campusId, name: { equals: name, mode: "insensitive" } } })');
  const create = post.indexOf("tx.supplier.create(");
  assert.ok(lock > 0 && lookup > lock && create > lookup);
});

test("same details replay with 200; different details under the same name are a 409", () => {
  assert.match(post, /if \(!same\) throw new ApiError\("A supplier with this name already exists", 409\);/);
  assert.match(post, /return \{ supplier: existing, replayed: true \};/);
  assert.match(post, /status: result\.replayed \? 200 : 201/);
});
