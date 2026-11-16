import assert from "node:assert/strict";
import test from "node:test";
import { compareClassesForList } from "../../src/lib/academic/class-order";

// SKAI-2081: class lists follow school order, not plain-text order.
test("classes sort pre-primary first, then grades numerically, newest year first", () => {
  const names = ["Grade 10", "Grade 1", "KG", "Grade 8", "Nursery", "Pre-Nursery", "Grade 9", "Grade 2"];
  const sorted = names.map((name, i) => ({ id: String(i), name, academicYear: 2026 })).sort(compareClassesForList).map((c) => c.name);
  assert.deepEqual(sorted, ["Pre-Nursery", "Nursery", "KG", "Grade 1", "Grade 2", "Grade 8", "Grade 9", "Grade 10"]);
  const years = [{ id: "a", name: "Grade 1", academicYear: 2025 }, { id: "b", name: "Grade 9", academicYear: 2026 }].sort(compareClassesForList);
  assert.equal(years[0].academicYear, 2026);
  const sections = [{ id: "a", name: "Grade 5", section: "B", academicYear: 2026 }, { id: "b", name: "Grade 5", section: "A", academicYear: 2026 }].sort(compareClassesForList);
  assert.equal(sections[0].section, "A");
});
