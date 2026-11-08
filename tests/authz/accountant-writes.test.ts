/**
 * SKAI-1284 — the ACCOUNTANT seat writes chart, bank, ledger, reconciliation and fee entries.
 *
 * The reported 403 came from route guards that asked a role list without ACCOUNTANT (canManageOperations /
 * the old canManageBilling) before the permission matrix. These checks pin the current contract: the write
 * routes gate on the matrix (or on canManageFinance, which includes ACCOUNTANT), and the ACCOUNTANT matrix
 * grants those writes for a school with no stored overrides. Denied roles and other schools stay refused.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { assertPermission } from "../../src/lib/permissions";
import { canManageFinance, canManageTuition } from "../../src/lib/api/scope";
import type { AuthUser } from "../../src/lib/auth";

const root = join(__dirname, "..", "..");
const code = (path: string) => readFileSync(join(root, path), "utf8")
  .split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
const handler = (src: string, verb: string) => {
  const start = src.indexOf(`export async function ${verb}(`);
  assert.ok(start >= 0, `${verb} handler exists`);
  const next = src.indexOf("export async function", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
};

const user = (role: AuthUser["role"], schoolId = "school-a"): AuthUser =>
  ({ userId: `${role}-1`, email: `${role.toLowerCase()}@qa.test`, role, schoolId, campusId: "campus-a" });

/** Only rows for the asked school are returned, like the real tenant-scoped query. */
const db = (rows: Record<string, any[]> = {}) => ({
  rolePermission: { findMany: async ({ where }: any) => rows[`${where.schoolId}:${where.role}`] ?? [] },
}) as any;

test("ACCOUNTANT passes the finance predicates that guard chart and invoice writes", () => {
  assert.equal(canManageFinance(user("ACCOUNTANT")), true);
  assert.equal(canManageTuition(user("ACCOUNTANT")), true);
  for (const role of ["TEACHER", "PARENT", "STUDENT", "LIBRARIAN"] as const) assert.equal(canManageFinance(user(role)), false, role);
});

test("ACCOUNTANT default matrix allows accounts add/edit and fees add", async () => {
  for (const [module, action] of [["accounts", "add"], ["accounts", "edit"], ["fees", "add"], ["fees", "edit"]] as const) {
    assert.equal(await assertPermission(user("ACCOUNTANT"), module, action, db()), true, `${module}.${action}`);
  }
  await assert.rejects(assertPermission(user("ACCOUNTANT"), "accounts", "delete", db()), /accounts\.delete denied/);
  await assert.rejects(assertPermission(user("TEACHER"), "accounts", "add", db()), /denied for TEACHER/);
});

test("a revoked override in one school does not affect the ACCOUNTANT of another school", async () => {
  const revoked = { module: "accounts", canView: true, canAdd: false, canEdit: false, canDelete: false, updatedAt: new Date() };
  const rows = { "school-a:ACCOUNTANT": [revoked] };
  await assert.rejects(assertPermission(user("ACCOUNTANT", "school-a"), "accounts", "add", db(rows)), /denied/);
  assert.equal(await assertPermission(user("ACCOUNTANT", "school-b"), "accounts", "add", db(rows)), true);
});

test("accounting write routes gate on the matrix, not on a role list that omits ACCOUNTANT", () => {
  const routes: Array<[string, string, RegExp]> = [
    ["src/app/api/accounts/chart/route.ts", "POST", /canManageFinance\(user\)/],
    ["src/app/api/accounts/bank-accounts/route.ts", "POST", /assertPermission\(user, "accounts", "add"\)/],
    ["src/app/api/accounts/bank-accounts/route.ts", "PATCH", /assertPermission\(user, "accounts", "edit"\)/],
    ["src/app/api/accounts/ledger/route.ts", "POST", /assertPermission\(user, "accounts", "add"\)/],
    ["src/app/api/fees/reconciliations/route.ts", "POST", /assertPermission\(user, "fees", "add"\)/],
    ["src/app/api/fees/generate-invoices/route.ts", "POST", /canManageFinance\(user\)[\s\S]*assertPermission\(user, "fees", "add"\)/],
  ];
  for (const [path, verb, guard] of routes) {
    const body = handler(code(path), verb);
    assert.match(body, guard, `${path} ${verb}`);
    assert.doesNotMatch(body, /canManageOperations|canManageAcademics|canManageCampusOps\(user\)\) throw/, `${path} ${verb} has no ACCOUNTANT-less role gate`);
  }
});
