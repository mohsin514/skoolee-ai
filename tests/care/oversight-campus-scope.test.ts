import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-597: a campus lead's emergency-access oversight shows only its own campus's access log.
type Row = Record<string, unknown>;
const match = (row: Row, where: Row): boolean => Object.entries(where).every(([k, v]) => {
  if (k === "OR") return (v as Row[]).some((w) => match(row, w));
  if (k === "AND") return (v as Row[]).every((w) => match(row, w));
  if (v && typeof v === "object" && "in" in (v as Row)) return ((v as { in: unknown[] }).in).includes(row[k]);
  return (row[k] ?? null) === v;
});
const members = [
  { userId: "lead-a1", schoolId: "school-a", campusId: "campus-a1", domain: "CLINIC", role: "LEAD", revokedAt: null },
  { userId: "nurse-a1", schoolId: "school-a", campusId: "campus-a1", domain: "CLINIC", role: "NURSE", revokedAt: null },
  { userId: "lead-a2", schoolId: "school-a", campusId: "campus-a2", domain: "CLINIC", role: "LEAD", revokedAt: null },
  { userId: "nurse-a2", schoolId: "school-a", campusId: "campus-a2", domain: "CLINIC", role: "NURSE", revokedAt: null },
];
const students = [
  { id: "kid-a1", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Synthetic A1" },
  { id: "kid-a2", schoolId: "school-a", campusId: "campus-a2", fullName: "QA Synthetic A2" },
];
const accessLogs: Row[] = [
  { id: "log-a1", schoolId: "school-a", domain: "CLINIC", studentId: "kid-a1", actorId: "nurse-a1", action: "VIEW", recordType: "CLINIC_VISIT", emergencyAccessId: null, createdAt: new Date() },
  { id: "log-a2", schoolId: "school-a", domain: "CLINIC", studentId: "kid-a2", actorId: "nurse-a2", action: "VIEW", recordType: "CLINIC_VISIT", emergencyAccessId: null, createdAt: new Date() },
  { id: "log-a2-ws", schoolId: "school-a", domain: "CLINIC", studentId: null, actorId: "nurse-a2", action: "DENIED", recordType: "WORKSPACE", emergencyAccessId: null, createdAt: new Date() },
  { id: "log-a1-ws", schoolId: "school-a", domain: "CLINIC", studentId: null, actorId: "nurse-a1", action: "VIEW", recordType: "OVERSIGHT", emergencyAccessId: null, createdAt: new Date() },
];
const written: Row[] = [];
const client = {
  confidentialMember: {
    findFirst: async ({ where }: { where: Row }) => members.find((m) => match(m, where)) ?? null,
    findMany: async ({ where }: { where: Row }) => members.filter((m) => match(m, where)),
  },
  confidentialSetting: { findFirst: async () => ({ enabled: true }) },
  confidentialAccessLog: {
    create: async ({ data }: { data: Row }) => { written.push(data); return data; },
    findMany: async ({ where }: { where: Row }) => accessLogs.filter((l) => match(l, where)),
    groupBy: async () => [],
  },
  emergencyAccess: { findMany: async () => [] },
  student: { findMany: async ({ where }: { where: Row }) => students.filter((s) => match(s, where)) },
  user: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, fullName: id })) },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: client } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async <T>(_u: unknown, work: (tx: unknown) => Promise<T>) => work(client) } });

const as = (id: string, campusId: string) => ({ userId: id, schoolId: "school-a", campusId, role: "TEACHER" }) as never;
const load = async () => (await import("../../src/lib/care/service")).oversight;

test("campus A's lead sees campus A's log rows, never campus B's", async () => {
  const oversight = await load();
  const ids = (await oversight(as("lead-a1", "campus-a1"), "CLINIC")).logs.map((l) => l.id).sort();
  assert.deepEqual(ids, ["log-a1", "log-a1-ws"]);
});

test("campus B's lead sees only campus B's rows", async () => {
  const oversight = await load();
  const ids = (await oversight(as("lead-a2", "campus-a2"), "CLINIC")).logs.map((l) => l.id).sort();
  assert.deepEqual(ids, ["log-a2", "log-a2-ws"]);
});

test("a nurse (not a lead) is refused oversight", async () => {
  const oversight = await load();
  await assert.rejects(oversight(as("nurse-a1", "campus-a1"), "CLINIC"), (e: { status?: number }) => e.status === 403);
});
