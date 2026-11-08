import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1378: a personal setup action locks only the actor's row, not the whole school.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const locks: string[] = [];

const tx = {
  $queryRaw: async (strings: TemplateStringsArray) => { locks.push(strings.join("?")); return []; },
  user: { update: async () => ({}) },
  schoolAiRequest: { findFirst: async () => null, create: async () => ({}) },
  auditLog: { create: async () => ({}) },
  campus: { findFirst: async () => null, create: async () => ({ id: "campus-new" }) },
};

mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_user: unknown, work: (client: unknown) => Promise<unknown>) => work(tx) } });
mock.module(src("lib/school-ai/access.ts"), { namedExports: { assertWorkspacePermission: async () => undefined, SchoolAiError: class extends Error {} } });
mock.module(src("lib/billing/entitlements.ts"), { namedExports: { assertPlanCapacity: async () => undefined } });
mock.module(src("lib/auth/institution.ts"), { namedExports: { isCampusOperator: () => false } });
mock.module(src("lib/front-desk/phone-calls.ts"), { namedExports: { logCall: async () => ({ call: { id: "call-1" } }) } });
mock.module(src("lib/ai-workflows/adapters/platform.ts"), { namedExports: { executePlatformAction: async () => ({}) } });
mock.module(src("lib/ai-workflows/adapters/students.ts"), { namedExports: { createAutomaticStudents: async () => ({}) } });

const user = { userId: "teacher-1", schoolId: "school-a", campusId: "campus-a", role: "TEACHER" };

test("personal profile update locks the actor row, not the school row", async () => {
  const { executeRoleAction } = await import(src("lib/ai-workflows/adapters/tool-actions.ts"));
  locks.length = 0;
  await executeRoleAction(user, "campus-a", "key-profile-1", { tool: "profile.update", title: "Update my profile", data: { preferredLanguage: "en" } } as never);
  assert.equal(locks.length, 1);
  assert.match(locks[0], /FROM users/);
  assert.doesNotMatch(locks[0], /FROM schools/);
});

test("school-wide campus creation still locks the school row", async () => {
  const { executeRoleAction } = await import(src("lib/ai-workflows/adapters/tool-actions.ts"));
  locks.length = 0;
  await executeRoleAction({ ...user, role: "SUPER_ADMIN" }, null, "key-campus-1", { tool: "campus.create", title: "Create campus", data: { name: "South" } } as never);
  assert.equal(locks.length, 1);
  assert.match(locks[0], /FROM schools/);
});
