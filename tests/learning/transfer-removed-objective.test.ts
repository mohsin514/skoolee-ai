import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1751: a corrected re-import that drops an objective left its old mapping stale. The workbench only
// shows objectives in the current evidence, so the stale row was invisible yet still blocked the bridge plan.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type Mapping = { id: string; schoolId: string; caseId: string; sourceObjectiveId: string; decision: string; stale: boolean; targetOutcomeIds: string[]; version: number };
let cases: Record<string, unknown>[] = [];
let mappings: Mapping[] = [];
let plans = 0;
const students = [
  { id: "p1", schoolId: "s1", campusId: "A", classId: "c1", fullName: "QA-01 Pupil", archivedAt: null },
  { id: "p2", schoolId: "s2", campusId: "A", classId: "c9", fullName: "QA-02 Pupil", archivedAt: null },
];
const match = (o: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => v === undefined || typeof v === "object" || o[k] === v);
const tx = {
  $executeRaw: async () => 0,
  student: { findFirst: async ({ where }: { where: Record<string, unknown> }) => students.find(s => match(s, where)) ?? null },
  subject: { findFirst: async () => null }, class: { findFirst: async () => null },
  learningTransferCase: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => cases.find(c => match(c, where)) ?? null,
    update: async () => ({}),
    updateMany: async ({ where }: { where: Record<string, unknown> }) => {
      const hit = cases.filter(c => match(c, where));
      for (const c of hit) c.version = (c.version as number) + 1;
      return { count: hit.length };
    },
  },
  learningTransferMapping: { findMany: async ({ where }: { where: Record<string, unknown> }) => mappings.filter(m => match(m, where)) },
  schoolAiRecord: { findFirstOrThrow: async () => ({ title: "Curriculum", version: 1, data: { outcomes: [{ id: "out-1", title: "Fractions", included: true }] } }) },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: tx } });
mock.module("@/lib/api/scope", { namedExports: {
  ApiError,
  canManageAcademics: (u: { role: string }) => ["PRINCIPAL", "CAMPUS_ADMIN"].includes(u.role),
  canManageCampusOps: (u: { role: string }) => u.role === "CAMPUS_ADMIN",
} });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async () => {} } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: typeof tx) => unknown) => fn(tx) } });
mock.module("@/lib/school-ai/assessment", { namedExports: { curriculumDataSchema: { parse: (d: unknown) => d } } });
mock.module("@/lib/learning/actions", { namedExports: { saveLearningAction: async () => ({ id: `plan-${++plans}` }) } });
mock.module("@/lib/parent/guardian-query", { namedExports: { liveGuardianRelationshipWhere: () => ({}) } });

const staff = (schoolId = "s1", role = "CAMPUS_ADMIN") => ({ userId: "u", role, schoolId, campusId: "A" }) as never;
const map = (sourceObjectiveId: string, decision: string, stale: boolean): Mapping => ({ id: `m-${sourceObjectiveId}`, schoolId: "s1", caseId: "case-1", sourceObjectiveId, decision, stale, targetOutcomeIds: ["out-1"], version: 2 });
function reset(evidenceIds: string[], rows: Mapping[]) {
  cases = [{ id: "case-1", schoolId: "s1", campusId: "A", studentId: "p1", destinationRecordId: "cur-a", destinationVersion: 1, version: 3, status: "MAPPING", sourceInstitution: "QA Source", sourceCurriculumName: "QA", sourceVersion: "2", consentScope: ["objectives"], consentGrantedAt: new Date(), consentRevokedAt: null, consentExpiresAt: null,
    evidence: { objectives: evidenceIds.map(id => ({ id, version: "1", title: `Objective ${id}`, work: "worksheet" })) } }];
  mappings = rows; plans = 0;
}
const bridge = async (user = staff()) => (await import("../../src/lib/learning/transfer")).createBridge(user, { caseId: "case-1", version: 3, reviewDate: "2026-12-01" });

test("a stale mapping for an objective removed by the corrected source no longer blocks the bridge", async () => {
  reset(["OBJ-A"], [map("OBJ-A", "ACCEPTED", false), map("OBJ-B", "ACCEPTED", true)]);
  const result = await bridge();
  assert.equal(result.planId, "plan-1");
  assert.equal(result.confirmed, 1);
});

test("a visible objective that is still stale or proposed keeps blocking, and a missing mapping blocks", async () => {
  reset(["OBJ-A", "OBJ-B"], [map("OBJ-A", "ACCEPTED", false), map("OBJ-B", "ACCEPTED", true)]);
  await assert.rejects(bridge(), (e: ApiError) => e.status === 409);
  reset(["OBJ-A"], [map("OBJ-A", "PROPOSED", false)]);
  await assert.rejects(bridge(), (e: ApiError) => e.status === 409);
  reset(["OBJ-A", "OBJ-C"], [map("OBJ-A", "ACCEPTED", false)]);
  await assert.rejects(bridge(), (e: ApiError) => e.status === 409);
  assert.equal(plans, 0);
});

test("another school cannot plan the case", async () => {
  reset(["OBJ-A"], [map("OBJ-A", "ACCEPTED", false)]);
  await assert.rejects(bridge(staff("s2")), (e: ApiError) => e.status === 404);
  assert.equal(plans, 0);
});

test("a role without transfer access is denied", async () => {
  reset(["OBJ-A"], [map("OBJ-A", "ACCEPTED", false)]);
  await assert.rejects(bridge(staff("s1", "ACCOUNTANT")), (e: ApiError) => e.status === 403);
  assert.equal(plans, 0);
});
