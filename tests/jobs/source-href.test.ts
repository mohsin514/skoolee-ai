// G49 (§7.8): a job's "Open source" link is the reader's own console view for that work, never another console.
import { test } from "node:test";
import assert from "node:assert/strict";
import { jobSourceHref } from "@/lib/jobs/service";
import { canOpenHref } from "@/lib/notifications/links";
import { USER_ROLES } from "@/lib/roles";

test("every role × job kind opens a route that role can open", () => {
  for (const role of USER_ROLES) {
    for (const kind of ["IMPORT", "PDF", "DELIVERY"]) {
      const href = jobSourceHref({ role }, { kind, source_id: "exam 1" });
      assert.ok(canOpenHref(role, href), `${role} ${kind}: ${href}`);
    }
  }
});

test("bank imports open the bank import tab; report jobs open Report cards for that exam", () => {
  assert.equal(jobSourceHref({ role: "ACCOUNTANT" }, { kind: "IMPORT", source_id: "b1" }), "/accountant?view=payments&tab=bank-import");
  assert.equal(jobSourceHref({ role: "CAMPUS_ADMIN" }, { kind: "IMPORT", source_id: "b1" }), "/admin?view=fees&tab=payments");
  assert.equal(jobSourceHref({ role: "PRINCIPAL" }, { kind: "PDF", source_id: "e 1" }), "/principal?view=report-cards&exam=e+1");
  assert.equal(jobSourceHref({ role: "ADMIN" }, { kind: "DELIVERY", source_id: "e1" }), "/admin?view=report-cards&exam=e1");
  assert.equal(jobSourceHref({ role: "TEACHER" }, { kind: "PDF", source_id: "e1" }), "/teacher/reports?exam=e1");
  assert.equal(jobSourceHref({ role: "SUPER_ADMIN" }, { kind: "PDF", source_id: "e1" }), "/super?view=campuses");
});
