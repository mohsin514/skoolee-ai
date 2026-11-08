import assert from "node:assert/strict";
import test from "node:test";
import { passwordRules, resetPasswordProblem, RESET_PASSWORD_UNMET } from "../../src/lib/auth/reset-password-policy";

test("server accepts only passwords the reset checklist accepts", () => {
  assert.equal(resetPasswordProblem("ChangedSynthetic209!"), null);
  for (const weak of ["aaaaaaaa", "abcdefg1!", "ABCDEFGH1", "Abcdefgh!"]) assert.equal(resetPasswordProblem(weak), RESET_PASSWORD_UNMET, weak);
});

test("length bounds and non-string input are rejected with the localizable length message", () => {
  for (const bad of ["Ab1!", "A1!" + "a".repeat(70), undefined, 12345678]) assert.equal(resetPasswordProblem(bad), "Use a password between 8 and 72 characters");
});

test("checklist rule order and confirmation match", () => {
  assert.deepEqual(passwordRules("Abcdefg1!", "Abcdefg1!"), [true, true, true, true, true]);
  assert.equal(passwordRules("Abcdefg1!", "other").at(-1), false);
  assert.equal(passwordRules("", "").at(-1), false);
});
