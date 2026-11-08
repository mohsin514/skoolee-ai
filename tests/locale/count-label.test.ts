import assert from "node:assert/strict";
import { test } from "node:test";
import { countLabel, isSingularCount } from "../../src/lib/locale/count-label";

// SKO-480: zero, one, two and many in each language, never an English "s" rule.
test("counts use each language's plural forms", () => {
  assert.deepEqual([0, 1, 2, 5].map((n) => countLabel("en", n, "student")), ["0 students", "1 student", "2 students", "5 students"]);
  assert.deepEqual([0, 1, 2, 5, 11, 100].map((n) => countLabel("ar", n, "student")), ["لا طلاب", "طالب واحد", "طالبان", "5 طلاب", "11 طالبًا", "100 طالب"]);
  assert.deepEqual([0, 1, 2].map((n) => countLabel("ur", n, "student")), ["0 طلبہ", "1 طالب علم", "2 طلبہ"]);
  assert.deepEqual([countLabel("en", 1, "class"), countLabel("en", 3, "class"), countLabel("en", 1, "subject"), countLabel("en", 0, "subject")], ["1 class", "3 classes", "1 subject", "0 subjects"]);
});

// SKAI-1025: dashboards say "1 teacher", "1 pupil", and label a lone tile "Class", never "1 classes".
test("teachers and pupils pluralize in EN, UR and AR", () => {
  assert.deepEqual([1, 2].map((n) => countLabel("en", n, "teacher")), ["1 teacher", "2 teachers"]);
  assert.deepEqual([1, 4].map((n) => countLabel("en", n, "pupil")), ["1 pupil", "4 pupils"]);
  assert.deepEqual([1, 2, 3].map((n) => countLabel("ar", n, "teacher")), ["معلم واحد", "معلمان", "3 معلمين"]);
  assert.deepEqual([1, 2].map((n) => countLabel("ur", n, "teacher")), ["1 استاد", "2 اساتذہ"]);
});

test("isSingularCount follows the language's plural rules", () => {
  assert.deepEqual([0, 1, 2].map((n) => isSingularCount("en", n)), [false, true, false]);
  assert.deepEqual([0, 1, 2].map((n) => isSingularCount("ar", n)), [false, true, false]);
  assert.equal(isSingularCount("ur", 1), true);
});
