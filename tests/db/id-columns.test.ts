import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkIdColumns, findUnrelatedIdColumns } from "../../scripts/check-id-columns.mjs";

// SKAI-1906: the checker that keeps every …Id column without a relation classified.
const schema = (body: string) => `model Parent {\n  id String @id\n}\nmodel Child {\n  id String @id\n${body}\n}\n`;

test("an …Id column with no relation is found; one with a relation is not", () => {
  const s = schema("  parentId String\n  parent Parent @relation(fields: [parentId], references: [id])\n  createdById String?\n  tagIds String[]");
  assert.deepEqual(findUnrelatedIdColumns(s), ["Child.createdById"]);
});

test("a column used inside a composite relation counts as related", () => {
  const s = schema("  schoolId String\n  parentId String\n  parent Parent @relation(fields: [schoolId, parentId], references: [schoolId, id])");
  assert.deepEqual(findUnrelatedIdColumns(s), []);
});

test("a new unclassified column fails the check", () => {
  assert.deepEqual(checkIdColumns(schema("  createdById String"), {}), ["Child.createdById: not classified; add it to prisma/id-columns.json"]);
});

test("a stale entry, an unknown class and a missing model each fail the check", () => {
  const s = schema("  createdById String\n  stripeId String");
  const problems = checkIdColumns(s, { "Child.createdById": "ref:User", "Child.stripeId": "vendor", "Child.goneId": "external" });
  assert.deepEqual(problems.sort(), [
    "Child.createdById: ref:User names no model",
    "Child.goneId: stale; it has a relation now or no longer exists, so remove it",
    'Child.stripeId: unknown class "vendor"',
  ]);
});

test("every class the registry allows is accepted", () => {
  const s = schema("  aId String\n  bId String\n  cId String\n  dId String\n  eId String\n  fId String");
  const registry = { "Child.aId": "ref:Parent", "Child.bId": "ref:?", "Child.cId": "external", "Child.dId": "snapshot", "Child.eId": "polymorphic", "Child.fId": "opaque" };
  assert.deepEqual(checkIdColumns(s, registry), []);
});

test("the real schema and prisma/id-columns.json agree", () => {
  const root = join(__dirname, "..", "..");
  const registry = JSON.parse(readFileSync(join(root, "prisma", "id-columns.json"), "utf8"));
  assert.deepEqual(checkIdColumns(readFileSync(join(root, "prisma", "schema.prisma"), "utf8"), registry), []);
});
