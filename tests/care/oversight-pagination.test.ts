import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-598: oversight pages its access log and grants newest first by cursor, inside the lead's school and campus.
type Row = Record<string, unknown>;
type FindArgs = { where: Row; orderBy?: unknown; take?: number; cursor?: { id: string }; skip?: number };
const match = (row: Row, where: Row): boolean => Object.entries(where).every(([k, v]) => {
  if (k === "OR") return (v as Row[]).some((w) => match(row, w));
  if (k === "AND") return (v as Row[]).every((w) => match(row, w));
  if (v && typeof v === "object" && "in" in (v as Row)) return ((v as { in: unknown[] }).in).includes(row[k]);
  return (row[k] ?? null) === v;
});
// Mirrors Prisma: filter, sort newest first (createdAt, then id), start after the cursor row, take a page.
const query = (rows: Row[], { where, take, cursor, skip }: FindArgs): Row[] => {
  const sorted = rows.filter((r) => match(r, where)).sort((a, b) => ((b.createdAt as Date).getTime() - (a.createdAt as Date).getTime()) || String(b.id).localeCompare(String(a.id)));
  let start = 0;
  if (cursor) {
    const at = sorted.findIndex((r) => r.id === cursor.id);
    if (at < 0) return [];
    start = at + (skip ?? 0);
  }
  return sorted.slice(start, take === undefined ? undefined : start + take);
};
const base = Date.UTC(2026, 10, 1);
const at = (i: number) => new Date(base - i * 60_000);
const members = [
  { userId: "lead-a1", schoolId: "school-a", campusId: "campus-a1", domain: "CLINIC", role: "LEAD", revokedAt: null },
  { userId: "nurse-a1", schoolId: "school-a", campusId: "campus-a1", domain: "CLINIC", role: "NURSE", revokedAt: null },
  { userId: "lead-a2", schoolId: "school-a", campusId: "campus-a2", domain: "CLINIC", role: "LEAD", revokedAt: null },
];
const students = [
  { id: "kid-a1", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Synthetic A1" },
  { id: "kid-a2", schoolId: "school-a", campusId: "campus-a2", fullName: "QA Synthetic A2" },
];
// 205 campus A1 rows (three pages), one campus A2 row and one school B row that must never page into campus A1.
const accessLogs: Row[] = [
  ...Array.from({ length: 205 }, (_, i) => ({ id: `log-a1-${String(i).padStart(3, "0")}`, schoolId: "school-a", domain: "CLINIC", studentId: "kid-a1", actorId: "nurse-a1", action: "VIEW", recordType: "CLINIC_VISIT", emergencyAccessId: null, createdAt: at(i) })),
  { id: "log-a2-x", schoolId: "school-a", domain: "CLINIC", studentId: "kid-a2", actorId: "nurse-a1", action: "VIEW", recordType: "CLINIC_VISIT", emergencyAccessId: null, createdAt: at(0) },
  { id: "log-b-x", schoolId: "school-b", domain: "CLINIC", studentId: "kid-a1", actorId: "nurse-a1", action: "VIEW", recordType: "CLINIC_VISIT", emergencyAccessId: null, createdAt: at(0) },
];
const grants: Row[] = [
  { id: "grant-a1", schoolId: "school-a", campusId: "campus-a1", domain: "CLINIC", studentId: "kid-a1", userId: "nurse-a1", purpose: "Allergy", createdAt: at(1), expiresAt: at(-60), revokedAt: null, reviewedAt: null, reviewedById: null, reviewNote: null },
];
const client = {
  confidentialMember: {
    findFirst: async ({ where }: { where: Row }) => members.find((m) => match(m, where)) ?? null,
    findMany: async ({ where }: { where: Row }) => members.filter((m) => match(m, where)),
  },
  confidentialSetting: { findFirst: async () => ({ enabled: true }) },
  confidentialAccessLog: {
    create: async ({ data }: { data: Row }) => data,
    findMany: async (args: FindArgs) => query(accessLogs, args),
    groupBy: async () => [],
  },
  emergencyAccess: { findMany: async (args: FindArgs) => query(grants, args) },
  student: { findMany: async ({ where }: { where: Row }) => students.filter((s) => match(s, where)) },
  user: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, fullName: id })) },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: client } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async <T>(_u: unknown, work: (tx: unknown) => Promise<T>) => work(client) } });

const as = (id: string, campusId: string) => ({ userId: id, schoolId: "school-a", campusId, role: "TEACHER" }) as never;
const load = async () => (await import("../../src/lib/care/service")).oversight;

test("the first page is the newest 100 log rows of the lead's campus, with a cursor to older rows", async () => {
  const oversight = await load();
  const page = await oversight(as("lead-a1", "campus-a1"), "CLINIC");
  assert.equal(page.logs.length, 100);
  assert.equal(page.logs[0].id, "log-a1-000");
  assert.ok(page.logs.every((l) => l.id.startsWith("log-a1-")), "no other campus or school rows");
  assert.equal(page.logsNextCursor, "log-a1-099");
});

test("following the cursor walks every page once, with no duplicates and no gaps", async () => {
  const oversight = await load();
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await oversight(as("lead-a1", "campus-a1"), "CLINIC", { logs: cursor });
    seen.push(...page.logs.map((l) => l.id));
    cursor = page.logsNextCursor;
  } while (cursor);
  assert.equal(seen.length, 205);
  assert.equal(new Set(seen).size, 205);
  assert.equal(seen[204], "log-a1-204");
});

test("a cursor from another campus or another school returns nothing and leaks nothing", async () => {
  const oversight = await load();
  for (const cursor of ["log-a2-x", "log-b-x"]) {
    const page = await oversight(as("lead-a1", "campus-a1"), "CLINIC", { logs: cursor });
    assert.deepEqual(page.logs, []);
    assert.equal(page.logsNextCursor, null);
  }
});

test("grants are paged too and report no cursor when the list fits one page", async () => {
  const oversight = await load();
  const page = await oversight(as("lead-a1", "campus-a1"), "CLINIC");
  assert.deepEqual(page.grants.map((g) => g.id), ["grant-a1"]);
  assert.equal(page.grantsNextCursor, null);
});

test("a campus A2 lead is refused a cursor for campus A1's grants", async () => {
  const oversight = await load();
  const page = await oversight(as("lead-a2", "campus-a2"), "CLINIC", { grants: "grant-a1" });
  assert.deepEqual(page.grants, []);
});
