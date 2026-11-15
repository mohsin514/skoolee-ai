import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApiError } from "../../src/lib/api/scope";
import { failureFrom, unwrapActionResult } from "../../src/lib/staff/action-result";

const source = readFileSync("src/app/actions/invite.ts", "utf8");

test("SKAI-2015: an ApiError becomes data carrying message, status and machine code", () => {
  assert.deepEqual(failureFrom(new ApiError("An invitation is already pending for this email.", 409)), { success: false, error: "An invitation is already pending for this email.", status: 409 });
  assert.deepEqual(failureFrom(new ApiError("Turn on two-step sign-in", 403, "MFA_REQUIRED")), { success: false, error: "Turn on two-step sign-in", status: 403, code: "MFA_REQUIRED" });
  assert.equal(failureFrom(new Error("boom")), null);
});

test("SKAI-2015: unwrapping a refusal rebuilds an Error with the server message and code; success passes through", () => {
  const ok = { success: true as const, inviteLink: "x" };
  assert.equal(unwrapActionResult(ok), ok);
  assert.throws(() => unwrapActionResult({ success: false, error: "Wait five minutes before trying again", status: 429, code: "X" }), (e: Error & { status?: number; code?: string }) => e.message === "Wait five minutes before trying again" && e.status === 429 && e.code === "X");
});

test("SKAI-2015: the four staff actions have Result forms that only convert ApiError, and the throwing forms remain for /api/staff", () => {
  assert.match(source, /if \(failure && error instanceof ApiError\) return failure;\s*throw error;/);
  for (const name of ["inviteStaff", "removeStaff", "cancelInvitation", "resendInvitation"]) {
    assert.match(source, new RegExp(`export async function ${name}Result\\(`));
    assert.match(source, new RegExp(`export async function ${name}\\(`));
  }
});

test("SKAI-2015: screens call the Result forms, never the throwing actions", () => {
  for (const file of ["src/app/super/page.tsx", "src/app/admin/page.tsx", "src/components/memberships/memberships-panel.tsx", "src/components/staff/add-staff-form.tsx", "src/components/teacher/add-teacher-form.tsx"]) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /await (inviteStaff|removeStaff|cancelInvitation|resendInvitation)\(/, file);
  }
});
