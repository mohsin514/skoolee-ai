import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturnPath } from "../../src/lib/auth/return-path";

// SKO-457: the post-login return is internal and limited to the signed-in role's own area.
test("an internal page in the role's own area is restored with its query and hash", () => {
  assert.equal(safeReturnPath("/teacher/classes?term=1#today", "TEACHER"), "/teacher/classes?term=1#today");
  assert.equal(safeReturnPath("/admin", "CAMPUS_ADMIN"), "/admin");
  // role-ux G46: the framed module routes a role can open are restored too, with their query.
  assert.equal(safeReturnPath("/messages?thread=t1", "TEACHER"), "/messages?thread=t1");
  assert.equal(safeReturnPath("/corrections?kind=PAYMENT", "ACCOUNTANT"), "/corrections?kind=PAYMENT");
  assert.equal(safeReturnPath("/billing?success=true", "SUPER_ADMIN"), "/billing?success=true");
  assert.equal(safeReturnPath("/search?q=ali", "RECEPTIONIST"), "/search?q=ali");
  assert.equal(safeReturnPath("/ai/exams/x1", "STUDENT"), "/ai/exams/x1");
});

test("the retired /dashboard console and routes a role cannot open are never restored (G46)", () => {
  assert.equal(safeReturnPath("/dashboard/students", "PRINCIPAL"), null);
  assert.equal(safeReturnPath("/dashboard", "SUPER_ADMIN"), null);
  assert.equal(safeReturnPath("/search", "TEACHER"), null, "record search is not a teacher route");
  assert.equal(safeReturnPath("/billing", "CAMPUS_ADMIN"), null, "billing is for the payer");
  assert.equal(safeReturnPath("/care", "PARENT"), null);
  assert.equal(safeReturnPath("/ai", "STUDENT"), null);
});

test("each role gets only the framed routes §6.3 and the matrix give it (G46)", () => {
  // Group admin: governance only. Record a concern stays (Help › Record a concern, §4.2); trips, activities and the
  // corrections queue do not (matrix #37, #46; §6.3 /corrections).
  assert.equal(safeReturnPath("/care?tab=report", "SUPER_ADMIN"), "/care?tab=report");
  assert.equal(safeReturnPath("/service-desk?tab=new", "SUPER_ADMIN"), "/service-desk?tab=new");
  for (const path of ["/transport", "/activities", "/corrections", "/search"]) assert.equal(safeReturnPath(path, "SUPER_ADMIN"), null, `SUPER_ADMIN ${path}`);
  // Flagship AI Workflows (addendum 2026-10-22): the group admin may return to the School AI workspace.
  assert.equal(safeReturnPath("/ai?workflow=schoolSetup", "SUPER_ADMIN"), "/ai?workflow=schoolSetup");
  // Front desk and library: trip duty and record search (front desk only); no activities (#46 "—"), no corrections.
  assert.equal(safeReturnPath("/transport", "RECEPTIONIST"), "/transport");
  assert.equal(safeReturnPath("/transport", "LIBRARIAN"), "/transport");
  for (const role of ["RECEPTIONIST", "LIBRARIAN"]) {
    assert.equal(safeReturnPath("/activities", role), null, `${role} /activities`);
    assert.equal(safeReturnPath("/corrections", role), null, `${role} /corrections`);
  }
  assert.equal(safeReturnPath("/search", "LIBRARIAN"), null);
  // The principal leads academics: activities (read) and the academic office, no trips (#37 "—").
  assert.equal(safeReturnPath("/activities", "PRINCIPAL"), "/activities");
  assert.equal(safeReturnPath("/exam-delivery", "PRINCIPAL"), "/exam-delivery");
  assert.equal(safeReturnPath("/transport", "PRINCIPAL"), null);
  // Duty and request routes for teachers and the finance desk.
  assert.equal(safeReturnPath("/transport", "TEACHER"), "/transport");
  assert.equal(safeReturnPath("/improvement?request=r1", "TEACHER"), "/improvement?request=r1", "evidence asked for by notification (#47)");
  assert.equal(safeReturnPath("/activities", "ACCOUNTANT"), "/activities", "activity refunds (#46)");
  assert.equal(safeReturnPath("/improvement", "ACCOUNTANT"), null);
  // Campus operators reach every framed campus route; only the payer reaches /billing.
  for (const path of ["/transport", "/activities", "/corrections", "/search", "/pupils/p1", "/exam-delivery", "/care"]) assert.equal(safeReturnPath(path, "CAMPUS_ADMIN"), path, `CAMPUS_ADMIN ${path}`);
  assert.equal(safeReturnPath("/billing", "ADMIN"), "/billing");
});

test("other origins, protocol tricks, auth routes and other roles' consoles fall back", () => {
  for (const raw of ["https://evil.example/teacher", "//evil.example/teacher", "/\\evil.example", "/\\/evil.example", "javascript:alert(1)", " /teacher", "/teacher\n/x", "/login", "/api/auth/session", "/admin", "/teachers", "", null, 42, "/" + "a".repeat(600)]) {
    assert.equal(safeReturnPath(raw, "TEACHER"), null, `refused ${String(raw).slice(0, 40)}`);
  }
  assert.equal(safeReturnPath("/dashboard/students", "PARENT"), null, "families never land in the staff dashboard");
  assert.equal(safeReturnPath("/teacher", "NOT_A_ROLE"), null);
  assert.equal(safeReturnPath("/teacher/%2F%2Fevil.example", "TEACHER"), "/teacher/%2F%2Fevil.example", "encoded slashes stay inside the path");
});
