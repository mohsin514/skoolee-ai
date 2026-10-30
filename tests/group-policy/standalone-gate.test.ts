/**
 * role-ux §7.3 G16 — group policy is a school-group instrument. In a single school (or when the institution kind is
 * unknown) every user-facing entry point answers 404 "Group policy applies to school groups." before it reads anything,
 * instead of a 403 that suggests a missing permission. Inside a group, only the group admin manages the library.
 *
 * Runs without a database: a stand-in that fails on any query is installed as `globalThis.prisma` before the service
 * loads (src/lib/db/prisma.ts reuses that client outside production), so a refusal here proves the gate runs first.
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";

const queried: string[] = [];
const failingPrisma: Record<string, unknown> = new Proxy({}, {
  get(_target, model) {
    if (typeof model !== "string" || model === "then") return undefined;
    return new Proxy({}, {
      get(_inner, operation) {
        if (typeof operation !== "string" || operation === "then") return undefined;
        return async () => { queried.push(`${model}.${operation}`); throw new Error(`unexpected query ${model}.${operation}`); };
      },
    });
  },
});

let policy: typeof import("../../src/lib/group-policy/service");

before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" });
  (globalThis as { prisma?: unknown }).prisma = failingPrisma;
  policy = await import("../../src/lib/group-policy/service");
});

const SCHOOL = "school-gate";
const CAMPUS = "campus-gate";
const user = (role: AuthUser["role"], extra: Partial<AuthUser> = {}): AuthUser => ({ userId: `user-${role.toLowerCase()}`, schoolId: SCHOOL, campusId: CAMPUS, role, email: `${role.toLowerCase()}@example.invalid`, ...extra });

async function status(work: () => Promise<unknown>) {
  try { await work(); return 200; } catch (error) { return (error as { status?: number }).status ?? 500; }
}
async function message(work: () => Promise<unknown>) {
  try { await work(); return null; } catch (error) { return (error as Error).message; }
}

const entryPoints = (actor: AuthUser): Array<[string, () => Promise<unknown>]> => [
  ["campusPolicy", () => policy.campusPolicy(actor, CAMPUS, "GRADING")],
  ["requestOverride", () => policy.requestOverride(actor, { campusId: CAMPUS, domain: "GRADING", key: "gradeA", value: 80, reason: "Synthetic reason", validUntil: new Date(Date.now() + 86_400_000).toISOString() })],
  ["decideOverride", () => policy.decideOverride(actor, { id: "override-1", decision: "APPROVE" })],
  ["revokeOverride", () => policy.revokeOverride(actor, "override-1")],
  ["library", () => policy.library(actor)],
  ["createTemplate", () => policy.createTemplate(actor, { domain: "GRADING", title: "Synthetic template" })],
  ["updateTemplate", () => policy.updateTemplate(actor, { id: "template-1" })],
  ["saveDraft", () => policy.saveDraft(actor, { templateId: "template-1", values: {} })],
  ["preview", () => policy.preview(actor, "version-1")],
  ["submitForReview", () => policy.submitForReview(actor, { versionId: "version-1" })],
  ["review", () => policy.review(actor, { versionId: "version-1", decision: "APPROVE" })],
  ["history", () => policy.history(actor, "template-1")],
  ["provenanceFor", () => policy.provenanceFor(actor, "GRADE_CONFIG", "record-1")],
];

test("a single school has no group policy: every entry point answers 404 before reading anything (G16)", async () => {
  const actors = [
    user("ADMIN", { institutionKind: "STANDALONE", isInstitutionOwner: true }),
    user("CAMPUS_ADMIN", { institutionKind: "STANDALONE" }),
    user("PRINCIPAL", { institutionKind: "STANDALONE" }),
    user("SUPER_ADMIN", { institutionKind: "STANDALONE", campusId: null }),
  ];
  for (const actor of actors) {
    for (const [name, work] of entryPoints(actor)) {
      assert.equal(await message(work), "Group policy applies to school groups.", `${actor.role} ${name}`);
      assert.equal(await status(work), 404, `${actor.role} ${name}`);
    }
  }
  assert.deepEqual(queried, [], "no query runs for a single school");
});

test("an unknown institution kind fails closed the same way (C32)", async () => {
  for (const [name, work] of entryPoints(user("SUPER_ADMIN", { campusId: null }))) assert.equal(await status(work), 404, name);
  assert.deepEqual(queried, []);
});

test("inside a group, only the group admin reaches the library and template writes", async () => {
  for (const role of ["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER"] as const) {
    const actor = user(role, { institutionKind: "GROUP" });
    for (const [name, work] of entryPoints(actor).filter(([name]) => !["campusPolicy", "requestOverride", "provenanceFor"].includes(name))) {
      assert.equal(await message(work), "Only the group admin can change group policy.", `${role} ${name}`);
    }
  }
  assert.deepEqual(queried, [], "refused before any query");
});
