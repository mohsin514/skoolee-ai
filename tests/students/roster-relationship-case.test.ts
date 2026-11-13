import assert from "node:assert/strict";
import { test } from "node:test";
import { importRelationship } from "../../src/lib/imports/csv";

test("SKAI-1224 roster import accepts guardian relationship in any letter case", () => {
  for (const value of ["MOTHER", "Mother", " mother "]) assert.equal(importRelationship(value), "mother");
  assert.equal(importRelationship(""), undefined);
});
