import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-599: a clinic export made under emergency access is logged against that grant, so the lead's
// oversight counts it as a use; a member's export is not marked as emergency.
type Row = Record<string, unknown>;
const logs: Row[] = [];
const members: Record<string, Row> = { "nurse-a1": { userId: "nurse-a1", schoolId: "school-a", campusId: "campus-a1", domain: "CLINIC", role: "NURSE" } };
const grants: Record<string, Row> = { "teacher-a1": { id: "grant-qa-1", userId: "teacher-a1", schoolId: "school-a", campusId: "campus-a1", domain: "CLINIC", studentId: "kid-a1", purpose: "Synthetic", expiresAt: new Date(Date.now() + 600_000), revokedAt: null } };
const client = {
  student: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => where.id === "kid-a1" && where.schoolId === "school-a" ? { id: "kid-a1", fullName: "QA Synthetic A1", campusId: "campus-a1", admissionNo: "QA-1", class: null } : null },
  confidentialMember: { findFirst: async ({ where }: { where: { userId: string } }) => members[where.userId] ?? null },
  confidentialSetting: { findFirst: async () => ({ enabled: true }) },
  emergencyAccess: { findFirst: async ({ where }: { where: { userId: string; studentId: string } }) => { const g = grants[where.userId]; return g && g.studentId === where.studentId ? g : null; } },
  confidentialAccessLog: { create: async ({ data }: { data: Row }) => { logs.push(data); return data; } },
  carePlan: { findFirst: async () => null },
  medicationInstruction: { findMany: async () => [] },
  clinicVisit: { findMany: async () => [] },
  medicationDose: { findMany: async () => [] },
  user: { findMany: async () => [] },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: client } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async <T>(_u: unknown, work: (tx: unknown) => Promise<T>) => work(client) } });

const as = (id: string) => ({ userId: id, schoolId: "school-a", campusId: "campus-a1", role: "TEACHER" }) as never;
const load = async () => (await import("../../src/lib/care/service")).exportClinic;
const exportRow = () => logs.find((l) => l.action === "EXPORT");

test("an export under emergency access is logged against the grant", async () => {
  const exportClinic = await load();
  logs.length = 0;
  const file = await exportClinic(as("teacher-a1"), "kid-a1");
  assert.match(file.body, /under emergency access/);
  assert.equal(exportRow()?.emergencyAccessId, "grant-qa-1");
});

test("a clinic member's export carries no emergency grant", async () => {
  const exportClinic = await load();
  logs.length = 0;
  await exportClinic(as("nurse-a1"), "kid-a1");
  assert.equal(exportRow()?.emergencyAccessId ?? null, null);
});

test("someone with neither membership nor a grant is refused and nothing is exported", async () => {
  const exportClinic = await load();
  logs.length = 0;
  await assert.rejects(exportClinic(as("teacher-other"), "kid-a1"), (e: { status?: number }) => e.status === 403);
  assert.equal(exportRow(), undefined);
});
