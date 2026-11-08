import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-608: trip invitees are validated the same way whether a pupil is named or comes from a class: only active,
// unarchived pupils of the leader's own school and campus can be invited, and nothing is written when one fails.
type Pupil = { id: string; schoolId: string; campusId: string; classId: string; status: string; archivedAt: Date | null };
const pupils: Pupil[] = [
  { id: "p-a1", schoolId: "school-a", campusId: "campus-a", classId: "c-a", status: "active", archivedAt: null },
  { id: "p-a2", schoolId: "school-a", campusId: "campus-a", classId: "c-a", status: "withdrawn", archivedAt: null },
  { id: "p-a3", schoolId: "school-a", campusId: "campus-a2", classId: "c-a2", status: "active", archivedAt: null },
  { id: "p-b1", schoolId: "school-b", campusId: "campus-b", classId: "c-b", status: "active", archivedAt: null },
];
type Where = { schoolId: string; campusId: string; id?: { in: string[] }; classId?: { in: string[] }; archivedAt: null; status?: string };
const match = (w: Where) => pupils.filter(p => p.schoolId === w.schoolId && p.campusId === w.campusId && (!w.id || w.id.in.includes(p.id)) && (!w.classId || w.classId.in.includes(p.classId)) && p.archivedAt === null && (!w.status || p.status === w.status));
let created: string[][] = [];
const tx = {
  $executeRaw: async () => 1,
  student: { findMany: async ({ where }: { where: Where }) => match(where).map(p => ({ id: p.id })), count: async ({ where }: { where: Where }) => match(where).length },
  trip: { findMany: async () => [], create: async ({ data }: { data: { invitees: { create: { studentId: string }[] } } }) => { created.push(data.invitees.create.map(i => i.studentId)); return { id: "t" }; } },
  tripVersion: { create: async () => ({}) },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: tx } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: unknown) => unknown) => fn(tx) } });

const leader = (s: "a" | "b") => ({ userId: `lead-${s}`, role: "CAMPUS_ADMIN", schoolId: `school-${s}`, campusId: `campus-${s}` }) as never;
const day = 86_400_000, at = (ms: number) => new Date(Date.now() + ms).toISOString();
const body = (extra: Record<string, unknown>) => ({ title: "Museum visit", destination: "City museum", departAt: at(5 * day), returnAt: at(5 * day + 3_600_000), respondBy: at(2 * day), contact: "Front office", ...extra });
const svc = () => import("@/lib/family/trips");

test("SKAI-608: a class invite takes only its active pupils", async () => {
  created = [];
  await (await svc()).createTrip(leader("a"), body({ classIds: ["c-a"] }));
  assert.deepEqual(created, [["p-a1"]]);
});

test("SKAI-608: a named withdrawn pupil is refused like a class invite would skip them", async () => {
  created = [];
  await assert.rejects((await svc()).createTrip(leader("a"), body({ studentIds: ["p-a1", "p-a2"] })), /must be an active pupil on this campus/);
  assert.equal(created.length, 0);
});

test("SKAI-608: pupils of another campus or school are refused; a teacher is denied", async () => {
  created = [];
  await assert.rejects((await svc()).createTrip(leader("a"), body({ studentIds: ["p-a3"] })), /on this campus/);
  await assert.rejects((await svc()).createTrip(leader("a"), body({ studentIds: ["p-b1"] })), /on this campus/);
  await assert.rejects((await svc()).createTrip(leader("b"), body({ classIds: ["c-a"] })), /Choose the pupils/);
  await assert.rejects((await svc()).createTrip({ userId: "t", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" } as never, body({ studentIds: ["p-a1"] })), /Only school leaders/);
  assert.equal(created.length, 0);
});
