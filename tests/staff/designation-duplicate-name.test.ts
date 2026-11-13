import assert from "node:assert/strict";
import test from "node:test";
import { duplicateDesignationNameMessage, isDuplicateDesignationName } from "../../src/lib/staff/designation-name";

test("a Prisma unique-constraint violation is recognised as a duplicate rank name", () => {
  assert.equal(isDuplicateDesignationName({ code: "P2002", meta: { target: ["school_id", "name"] } }), true);
});

test("other errors, including other Prisma codes, are not treated as duplicates", () => {
  assert.equal(isDuplicateDesignationName({ code: "P2025" }), false);
  assert.equal(isDuplicateDesignationName(new Error("boom")), false);
  assert.equal(isDuplicateDesignationName(null), false);
  assert.equal(isDuplicateDesignationName("P2002"), false);
});

test("the duplicate message names the rank and asks for another name", () => {
  assert.equal(
    duplicateDesignationNameMessage("QA126 A"),
    'A rank called "QA126 A" already exists in this school. Pick a different name.'
  );
});
