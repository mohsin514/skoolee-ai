import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/lib/resources/service.ts", "utf8");
const fn = (name: string) => { const start = source.indexOf(`export async function ${name}`); return source.slice(start, source.indexOf("\nexport ", start + 10)); };

test("SKAI-1486: lifecycle writes re-check 'not retired' in the same statement", () => {
  assert.match(source, /updateMany\(\{ where: \{ id: resourceId, status: \{ not: "RETIRED" \} \}, data \}\);\s*if \(claimed\.count !== 1\) throw new ApiError\([^)]*, 409\)/);
  for (const name of ["publishResource", "changeAudience", "linkResourceObjectives", "addResourceVersion"]) {
    assert.match(fn(name), /updateUnlessRetired\(tx, resource\.id, /, name);
    assert.doesNotMatch(fn(name), /learningResource\.update\(/, name);
  }
});

test("SKAI-1486: retiring is conditional and idempotent, auditing only the first retire", () => {
  const retire = fn("retireResource");
  assert.match(retire, /updateMany\(\{ where: \{ id: resource\.id, status: \{ not: "RETIRED" \} \}, data: \{ status: "RETIRED"/);
  assert.ok(retire.indexOf("if (claimed.count !== 1) return") < retire.indexOf("auditLog.create"));
});
