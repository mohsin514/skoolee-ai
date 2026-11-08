// P9 acceptance (§11 P9 item 5; C13, G47, F26). Pure: result links are computed without a database.
// Search results never point a role at a console it cannot open, and only the roles with a "Search records" link
// (campus operators, the academic lead, the front desk) may search at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RECORD_SEARCH_ROLES, TYPES, canSearchRecords, resultHref } from "@/lib/search/service";
import { canOpenHref } from "@/lib/notifications/links";
import { USER_ROLES } from "@/lib/roles";

const OPENABLE: Record<(typeof RECORD_SEARCH_ROLES)[number], readonly (typeof TYPES)[number][]> = {
  CAMPUS_ADMIN: TYPES,
  ADMIN: TYPES,
  PRINCIPAL: ["student", "class", "staff"],
  RECEPTIONIST: ["application"],
};

test("record search belongs to campus operators, the academic lead and the front desk only", () => {
  assert.deepEqual([...RECORD_SEARCH_ROLES].sort(), ["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "RECEPTIONIST"]);
  for (const role of USER_ROLES) assert.equal(canSearchRecords(role), (RECORD_SEARCH_ROLES as readonly string[]).includes(role), role);
});

test("every result opens inside the searcher's own console", () => {
  const record = { id: "rec 1/2", reference: "APP-2026-001", isTeacher: true };
  for (const role of RECORD_SEARCH_ROLES) {
    for (const type of OPENABLE[role]) {
      for (const isTeacher of [true, false]) {
        const href = resultHref(role, type, { ...record, isTeacher });
        assert.ok(canOpenHref(role, href), `${role} ${type}: ${href}`);
        assert.ok(!href.startsWith("/dashboard"), `${role} ${type}: never a legacy /dashboard page`);
      }
    }
  }
});

test("per-role destinations (G47)", () => {
  assert.equal(resultHref("CAMPUS_ADMIN", "student", { id: "s1" }), "/pupils/s1");
  assert.equal(resultHref("ADMIN", "class", { id: "c1" }), "/admin?view=students&class=c1");
  assert.equal(resultHref("ADMIN", "staff", { id: "u1", isTeacher: false }), "/admin?view=staff-hierarchy");
  assert.equal(resultHref("CAMPUS_ADMIN", "application", { id: "a1", reference: "APP-1" }), "/admin?view=admissions&tab=applications&q=APP-1");
  assert.equal(resultHref("PRINCIPAL", "student", { id: "s1" }), "/principal?view=students&student=s1");
  assert.equal(resultHref("PRINCIPAL", "class", { id: "c1" }), "/principal?view=classes&class=c1");
  assert.equal(resultHref("RECEPTIONIST", "application", { id: "a1", reference: "APP-1" }), "/receptionist?view=admissions&tab=applications&q=APP-1");
});
