import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PROFILE_ONLY_STUDENT_FIELDS, rosterSummarySelect } from "../../src/lib/students/roster-summary";

// SKAI-163: a directory list carries the summary; sensitive fields only leave through /api/students/<id>.
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the roster summary never selects a profile-only field", () => {
  for (const field of PROFILE_ONLY_STUDENT_FIELDS) {
    assert.equal(field in rosterSummarySelect, false, `${field} must stay on the single-record read`);
  }
});

test("the summary still carries what the directory, filters, export and restore dialog show", () => {
  for (const field of ["id", "fullName", "rollNo", "admissionNo", "gender", "status", "guardianName", "guardianPhone", "guardianEmail", "class", "category", "group", "studentUser", "archivedAt"]) {
    assert.ok(field in rosterSummarySelect, `${field} is rendered by a list`);
  }
});

test("both roster loaders use the shared summary and neither falls back to a whole-row include", () => {
  const api = source("src/app/api/students/route.ts");
  const getHandler = api.slice(api.indexOf("export async function GET"), api.indexOf("export async function POST"));
  assert.match(getHandler, /\.\.\.rosterSummarySelect/);
  assert.doesNotMatch(getHandler, /include:\s*\{/, "include returns every scalar column");

  const dashboard = source("src/app/actions/dashboard.ts");
  const campusRoster = dashboard.slice(dashboard.indexOf('L.widget("students"'), dashboard.indexOf('L.widget("recentExams"'));
  assert.match(campusRoster, /\.\.\.rosterSummarySelect/);
  for (const field of PROFILE_ONLY_STUDENT_FIELDS) {
    assert.doesNotMatch(campusRoster, new RegExp(`\\b${field}: true`), `campus roster selects ${field}`);
  }
});

test("the single-record read keeps its stricter gate", () => {
  const detail = source("src/app/api/students/[id]/route.ts");
  assert.match(detail, /canManageAcademics\(user\)/);
  assert.match(detail, /scopedCampusWhere\(user, user\.campusId\)/);
});
