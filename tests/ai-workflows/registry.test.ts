import { test, after } from "node:test";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
import assert from "node:assert/strict";
import { z } from "zod";
import { USER_ROLES } from "../../src/lib/roles";
import { REGISTRY, entriesForRole } from "../../src/lib/ai-workflows/registry";
import { defineCapability, RegistryDefinitionError } from "../../src/lib/ai-workflows/registry/define";
import { floorFor, atLeast, escalate } from "../../src/lib/ai-workflows/registry/floors";
import { roles, permission, runGates } from "../../src/lib/ai-workflows/registry/gates";
import { exclusionFor } from "../../src/lib/ai-workflows/registry/exclusions";
import { aiOutputSchema } from "../../src/lib/ai/output-schema";
import type { CapabilityContext, EntryCopy } from "../../src/lib/ai-workflows/registry/types";

// Importing the registry loads Prisma and the queue client; release them so the file can finish.
after(async () => { await prisma.$disconnect(); redis.disconnect(); });

const copy: EntryCopy = { title: { en: "T", ar: "ع", ur: "ا" }, whenToUse: { en: "W", ar: "ع", ur: "ا" }, examples: { en: ["e"], ar: ["ع"], ur: ["ا"] } };
const base = { version: 1, cluster: "C7" as const, inventoryKeys: ["x.y"], roles: ["LIBRARIAN"] as const, copy, input: z.object({}), evidence: [], gates: [roles(["LIBRARIAN"])], scope: { kind: "own-campus" as const }, source: { service: "s", reuse: "direct" as const } };

test("every entry respects its risk floor, has copy in three languages and a JSON schema the model can read", () => {
  assert.ok(REGISTRY.size >= 36);
  for (const entry of REGISTRY.values()) {
    assert.ok(atLeast(entry.class, floorFor(entry.key, entry.risk)), `${entry.key} below floor`);
    assert.doesNotThrow(() => aiOutputSchema(entry.input), `${entry.key} input cannot be shown to the model`);
    if (entry.class === "C") assert.equal((entry as { execute?: unknown }).execute, undefined, `${entry.key} hands off but executes`);
  }
});

test("money, messages, access, publication and approvals are never class A or B", () => {
  for (const entry of REGISTRY.values()) {
    if (["FINANCIAL", "COMMUNICATION", "ACCESS_GRANT", "PUBLISH", "APPROVAL_DECISION", "DESTRUCTIVE"].includes(entry.risk)) assert.equal(entry.class, "C", entry.key);
  }
  assert.equal(REGISTRY.get("finance.apply_operation")?.class, "C");
  assert.equal(REGISTRY.get("setup.holidays_delete")?.class, "C");
  assert.equal(REGISTRY.get("setup.holidays")?.class, "B");
});

test("definitions below their floor, class C with execute, or missing Urdu copy are refused at import", () => {
  const execute = async () => ({ kind: "write" as const, capability: "x.y", entities: [], counts: {}, link: null, replayed: false });
  assert.throws(() => defineCapability({ ...base, key: "library.issue_copy", risk: "CREATE", class: "A", idempotency: { mode: "natural" }, execute }), RegistryDefinitionError);
  assert.throws(() => defineCapability({ ...base, key: "fees.refund", risk: "FINANCIAL", class: "C", handoff: { kind: "DOMAIN_SCREEN", prepare: async () => ({ kind: "DOMAIN_SCREEN", targetRoles: [], link: "/", prefill: {} }) }, execute } as never), RegistryDefinitionError);
  assert.throws(() => defineCapability({ ...base, key: "library.issue_copy", risk: "CREATE", class: "B", idempotency: { mode: "natural" }, execute, preview: async () => ({ title: "", lines: [], counts: {}, basis: null }), copy: { ...copy, title: { ...copy.title, ur: " " } } }), RegistryDefinitionError);
  assert.throws(() => defineCapability({ ...base, key: "library.issue_copy", risk: "CREATE", class: "B", idempotency: { mode: "natural" }, execute }), /preview/);
});

test("the class only escalates", () => {
  assert.equal(escalate("B", "A"), "B");
  assert.equal(escalate("A", "C"), "C");
});

test("gates mirror roles and the live permission matrix; SUPER_ADMIN keeps fixed access", async () => {
  const ctx = (role: (typeof USER_ROLES)[number], canAdd: boolean): CapabilityContext => ({ user: { userId: "u", email: "u@example.invalid", role, schoolId: "s", campusId: "c" }, campusId: "c", permissions: new Map([["library", { canView: true, canAdd, canEdit: false, canDelete: false }]]), seats: async () => ({ campusAdmin: true, principal: false, accountant: false, receptionist: false, librarian: false }), locale: "en", now: new Date() });
  assert.deepEqual(await runGates(ctx("LIBRARIAN", true), [roles(["LIBRARIAN"]), permission("library", "add")]), { ok: true });
  assert.equal((await runGates(ctx("LIBRARIAN", false), [roles(["LIBRARIAN"]), permission("library", "add")])).ok, false);
  assert.equal((await runGates(ctx("TEACHER", true), [roles(["LIBRARIAN"])])).ok, false);
  assert.deepEqual(await runGates(ctx("SUPER_ADMIN", false), [permission("library", "add")]), { ok: true });
});

test("roles only see entries listed for them; families cannot reach school operations", () => {
  // Families and students hold only personal and family entries (Slice 4): no typed school operation,
  // no fee, leave, staff, roster or setup capability, and nothing scoped beyond self or own child.
  for (const role of ["STUDENT", "PARENT"] as const) for (const entry of entriesForRole(role)) {
    assert.ok(!/^(setup|academics|fees\.(?!start_online_payment$)|leave\.create|staff|imports|academic|timetable|finance|attendance\.)/.test(entry.key), `${role} reaches ${entry.key}`);
    if (entry.risk === "FINANCIAL") assert.equal(entry.class, "C", `${role} ${entry.key} may only hand off money`);
    assert.ok(["self", "own-child"].includes(entry.scope.kind), `${role} ${entry.key} scope ${entry.scope.kind}`);
  }
  assert.ok(entriesForRole("STUDENT").some(entry => entry.key === "pathways.save_goal_private"));
  assert.ok(entriesForRole("TEACHER").every(entry => !entry.key.startsWith("setup.")));
});

test("never-automatable surfaces are excluded with a reason", () => {
  for (const key of ["auth.login", "payments.stripe_webhook", "system.risk_digest", "exams.attempt.save_or_submit", "uploads.presign_document"]) assert.ok(exclusionFor(key)?.reason, key);
  assert.equal(exclusionFor("library.issue_copy"), null);
});
