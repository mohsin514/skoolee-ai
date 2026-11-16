import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2161: the catalogue row has an Edit action that PATCHes the title through the existing API.
test("BooksTab offers Edit and saves it with PATCH /api/library/books", () => {
  const source = readFileSync("src/components/operations/index.tsx", "utf8");
  const tab = source.slice(source.indexOf("function BooksTab("), source.indexOf("\n}\n", source.indexOf("function BooksTab(")));
  assert.match(tab, /data-book-edit/);
  assert.match(tab, /method: editingId \? "PATCH" : "POST"/);
  assert.match(tab, /\{ \.\.\.values, id: editingId \}/);
});
