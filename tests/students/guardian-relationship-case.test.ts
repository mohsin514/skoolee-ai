import assert from "node:assert/strict";
import { test } from "node:test";
import { GUARDIAN_RELATIONSHIP_LABELS, guardianRelationshipLabel, guardianRelationshipValue } from "../../src/lib/students/guardian-relationship";
import { studentSchema } from "../../src/lib/validators/schemas";

test("SKAI-1928 a relationship saved by admission selects its option on the edit form", () => {
  for (const stored of ["father", "FATHER", " Father "]) {
    assert.equal(guardianRelationshipValue(stored), "father");
    assert.equal(guardianRelationshipLabel(stored), "Father");
  }
  assert.ok(Object.hasOwn(GUARDIAN_RELATIONSHIP_LABELS, guardianRelationshipValue("father")));
});

test("SKAI-1928 every value the admission schema accepts has an edit option", () => {
  const rejected = studentSchema.safeParse({ guardianRelationship: "FATHER" });
  assert.ok(!rejected.success && rejected.error.issues.some(issue => issue.path[0] === "guardianRelationship"));
  for (const value of ["father", "mother", "uncle", "aunt", "sibling", "other"]) {
    const parsed = studentSchema.safeParse({ guardianRelationship: value });
    assert.ok(parsed.success || !parsed.error.issues.some(issue => issue.path[0] === "guardianRelationship"), value);
    assert.ok(Object.hasOwn(GUARDIAN_RELATIONSHIP_LABELS, value), value);
  }
});

test("SKAI-1928 unknown or blank relationships stay as stored and have no label", () => {
  assert.equal(guardianRelationshipValue("step-parent"), "step-parent");
  assert.equal(guardianRelationshipLabel("step-parent"), undefined);
  assert.equal(guardianRelationshipValue(null), "");
  assert.equal(guardianRelationshipLabel(""), undefined);
  assert.equal(guardianRelationshipLabel("constructor"), undefined);
});
