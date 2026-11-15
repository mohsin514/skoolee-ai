import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2154: a campus catalogue holds one title per ISBN, checked on create and on ISBN edits.
test("createBook and updateBook refuse an ISBN already catalogued on the campus", () => {
  const source = readFileSync("src/lib/library/catalogue-command.ts", "utf8");
  const guard = source.slice(source.indexOf("async function assertIsbnFree"), source.indexOf("/** POST /api/library/books. */"));
  assert.match(guard, /where: \{ campusId, isbn,/);
  assert.match(guard, /409/);
  const create = source.slice(source.indexOf("export async function createBook"), source.indexOf("export async function updateBook"));
  assert.match(create, /if \(isbn\) await assertIsbnFree\(campusId, isbn\)/);
  assert.match(source, /assertIsbnFree\(existing\.campusId, isbn, existing\.id\)/);
});
