import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1707: a retried or second-tab alumni consent replays the one profile; changed details are a 409.
type Row = Record<string, unknown> & { id: string; schoolId: string; campusId: string; contactEmail: string; consentWithdrawnAt: Date | null; dateOfBirth: Date };
const rows: Row[] = [];
const locks = new Map<string, Promise<void>>();
const model = {
  findFirst: async ({ where }: { where: { schoolId: string; campusId: string; contactEmail: { equals: string } } }) => rows.find((r) => r.schoolId === where.schoolId && r.campusId === where.campusId && r.consentWithdrawnAt === null && r.contactEmail.toLowerCase() === where.contactEmail.equals.toLowerCase()) ?? null,
  create: async ({ data }: { data: Omit<Row, "id" | "consentWithdrawnAt"> }) => { await new Promise((r) => setTimeout(r, 5)); const row = { id: `al${rows.length + 1}`, consentWithdrawnAt: null, ...data } as Row; rows.push(row); return row; },
};
const counsellors = new Set(["couns-a", "couns-b"]);
const prisma = {
  pathwayCounsellor: { findFirst: async ({ where }: { where: { userId: string } }) => (counsellors.has(where.userId) ? { id: "c" } : null) },
  alumniProfile: model,
  $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
    let release = () => {};
    const tx = {
      alumniProfile: model,
      $executeRaw: async (_s: TemplateStringsArray, key: string) => {
        while (locks.has(key)) await locks.get(key);
        locks.set(key, new Promise<void>((r) => { release = () => { locks.delete(key); r(); }; }));
      },
    };
    try { return await fn(tx); } finally { release(); }
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });

const couns = (s: "a" | "b") => ({ userId: `couns-${s}`, schoolId: `school-${s}`, campusId: `campus-${s}1`, role: "TEACHER" }) as never;
const data = { displayName: "QA Alumna", pathway: "Synthetic engineering degree", contactEmail: "QA.Alumna@example.test", dateOfBirth: "2000-01-15", visibility: "STAFF_ONLY", mentoring: true, consentEvidence: "Signed synthetic consent form" };
const load = async () => (await import("../../src/lib/pathways/service")).recordAlumni;

test("a lost-response retry replays the one profile", async () => {
  const recordAlumni = await load();
  rows.length = 0;
  const a = await recordAlumni(couns("a"), data);
  const b = await recordAlumni(couns("a"), { ...data, contactEmail: "qa.alumna@example.test" });
  assert.equal(a.replayed, false);
  assert.equal(b.replayed, true);
  assert.equal(b.id, a.id);
  assert.equal(rows.length, 1);
});

test("two tabs at once serialise into one profile", async () => {
  const recordAlumni = await load();
  rows.length = 0;
  const [x, y] = await Promise.all([recordAlumni(couns("a"), data), recordAlumni(couns("a"), data)]);
  assert.equal(rows.length, 1);
  assert.equal(x.id, y.id);
  assert.deepEqual([x.replayed, y.replayed].sort(), [false, true]);
});

test("changed details for a live profile are a 409; after withdrawal fresh consent is recorded", async () => {
  const recordAlumni = await load();
  rows.length = 0;
  await recordAlumni(couns("a"), data);
  await assert.rejects(recordAlumni(couns("a"), { ...data, visibility: "STUDENTS" }), (e: { status?: number }) => e.status === 409);
  rows[0].consentWithdrawnAt = new Date();
  assert.equal((await recordAlumni(couns("a"), data)).replayed, false);
  assert.equal(rows.length, 2);
});

test("the same email in another school is its own profile", async () => {
  const recordAlumni = await load();
  rows.length = 0;
  await recordAlumni(couns("a"), data);
  const b = await recordAlumni(couns("b"), data);
  assert.equal(b.replayed, false);
  assert.equal(b.schoolId, "school-b");
  assert.equal(rows.length, 2);
});

test("a teacher who is not a designated counsellor gets 403", async () => {
  const recordAlumni = await load();
  const teacher = { userId: "t-x", schoolId: "school-a", campusId: "campus-a1", role: "TEACHER" } as never;
  await assert.rejects(recordAlumni(teacher, data), (e: { status?: number }) => e.status === 403);
});
