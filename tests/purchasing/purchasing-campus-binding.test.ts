import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";

// SKAI-1431: purchasing lookups and mutations are bound to the actor's campus.
const service = readFileSync("src/lib/purchasing/service.ts", "utf8");

test("SKAI-1431: request lookups for submit, decide, receive, return and invoice carry the campus filter", () => {
  assert.match(service, /const campusFilter = \(user: AuthUser\)/);
  assert.equal((service.match(/purchaseRequest\.findFirst\(\{ where: \{ id, schoolId: user\.schoolId, \.\.\.campusFilter\(user\) \} \}\)/g) ?? []).length, 5);
});

test("SKAI-1431: invoice resolution is bound to the actor's campus", () => {
  assert.match(service, /supplierInvoice\.updateMany\(\{ where: \{ id: invoiceId, schoolId: user\.schoolId, status: "REVIEW", \.\.\.campusFilter\(user\) \}/);
});
