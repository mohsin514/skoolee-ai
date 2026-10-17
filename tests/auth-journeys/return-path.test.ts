import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturnPath } from "../../src/lib/auth/return-path";

// SKO-457: the post-login return is internal and limited to the signed-in role's own area.
test("an internal page in the role's own area is restored with its query and hash", () => {
  assert.equal(safeReturnPath("/teacher/classes?term=1#today", "TEACHER"), "/teacher/classes?term=1#today");
  assert.equal(safeReturnPath("/admin", "CAMPUS_ADMIN"), "/admin");
  assert.equal(safeReturnPath("/dashboard/students", "PRINCIPAL"), "/dashboard/students");
});

test("other origins, protocol tricks, auth routes and other roles' consoles fall back", () => {
  for (const raw of ["https://evil.example/teacher", "//evil.example/teacher", "/\\evil.example", "/\\/evil.example", "javascript:alert(1)", " /teacher", "/teacher\n/x", "/login", "/api/auth/session", "/admin", "/teachers", "", null, 42, "/" + "a".repeat(600)]) {
    assert.equal(safeReturnPath(raw, "TEACHER"), null, `refused ${String(raw).slice(0, 40)}`);
  }
  assert.equal(safeReturnPath("/dashboard/students", "PARENT"), null, "families never land in the staff dashboard");
  assert.equal(safeReturnPath("/teacher", "NOT_A_ROLE"), null);
  assert.equal(safeReturnPath("/teacher/%2F%2Fevil.example", "TEACHER"), "/teacher/%2F%2Fevil.example", "encoded slashes stay inside the path");
});
