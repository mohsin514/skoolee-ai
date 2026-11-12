import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findUnindexedForeignKeys } from "../../scripts/check-fk-indexes.mjs";

// SKAI-1806: the checker that keeps every foreign key indexed.
const model = (body: string) => `model Parent {\n  id String @id\n}\nmodel Child {\n  id String @id\n${body}\n}\n`;
const gaps = (body: string) => findUnindexedForeignKeys(model(body)).map((g: { columns: string[] }) => g.columns.join("+"));

test("a foreign key with no index is reported", () => {
  assert.deepEqual(gaps("  parentId String\n  parent Parent @relation(fields: [parentId], references: [id])"), ["parentId"]);
});

test("an index, unique or id leading with the foreign key covers it", () => {
  const fk = "  parentId String\n  parent Parent @relation(fields: [parentId], references: [id])\n";
  assert.deepEqual(gaps(fk + "  @@index([parentId, createdAt])"), []);
  assert.deepEqual(gaps(fk + "  @@unique([parentId, slot])"), []);
  assert.deepEqual(gaps("  parentId String @unique\n  parent Parent @relation(fields: [parentId], references: [id])"), []);
});

test("an index where the foreign key is not the leading column does not cover it", () => {
  assert.deepEqual(gaps("  parentId String\n  parent Parent @relation(fields: [parentId], references: [id])\n  @@index([schoolId, parentId])"), ["parentId"]);
});

test("a composite foreign key needs its columns as the leading prefix, in order", () => {
  const fk = "  parentId String\n  schoolId String\n  parent Parent @relation(fields: [parentId, schoolId], references: [id, schoolId])\n";
  assert.deepEqual(gaps(fk + "  @@index([parentId, schoolId, day])"), []);
  assert.deepEqual(gaps(fk + "  @@index([schoolId, parentId])"), ["parentId+schoolId"]);
});

test("the real schema has no unindexed foreign keys", () => {
  const schema = readFileSync(join(__dirname, "..", "..", "prisma", "schema.prisma"), "utf8");
  assert.deepEqual(findUnindexedForeignKeys(schema), []);
});
