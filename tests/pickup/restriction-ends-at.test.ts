import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2133: a restriction end date is parsed and must be in the future (400, never 500 or a silent past date).
test("pickup restriction endsAt is validated before it is stored", () => {
  const service = readFileSync("src/lib/pickup/service.ts", "utf8");
  const add = service.slice(service.indexOf("export async function addRestriction"), service.indexOf("export async function liftRestriction"));
  assert.match(add, /Number\.isNaN\(endsAt\.getTime\(\)\)/);
  assert.match(add, /endsAt\.getTime\(\) <= Date\.now\(\)/);
  assert.doesNotMatch(add, /endsAt: body\.endsAt \? new Date/);
});
