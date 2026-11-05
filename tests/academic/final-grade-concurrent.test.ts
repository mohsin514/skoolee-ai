import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { findOrCreateFinalExam } from "../../src/lib/academic/final-grade-exam";

// SKAI-1688: an in-memory database whose advisory lock really serialises transactions by key.
function fakeDb() {
  const exams: { id: string; campusId: string; classId: string; academicYear: number; examType: string; subjectId: null; status: string; totalMarks: number }[] = [];
  const audits: string[] = [];
  const locks = new Map<string, Promise<void>>();
  const keys: string[] = [];
  const transaction = async <T>(fn: (tx: never) => Promise<T>) => {
    let release = () => {};
    const tx = {
      $executeRaw: async (_s: TemplateStringsArray, key: string) => {
        keys.push(key);
        const held = locks.get(key) ?? Promise.resolve();
        const mine = new Promise<void>((r) => { release = r; });
        locks.set(key, held.then(() => mine));
        await held;
        return 1;
      },
      exam: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          await new Promise((r) => setTimeout(r, 5)); // widen the race window
          return exams.find((e) => e.campusId === where.campusId && e.classId === where.classId && e.academicYear === where.academicYear && e.examType === where.examType) ?? null;
        },
        create: async ({ data }: { data: Omit<(typeof exams)[number], "id" | "subjectId"> }) => {
          const exam = { ...data, id: `e${exams.length + 1}`, subjectId: null };
          exams.push(exam);
          return exam;
        },
      },
      auditLog: { create: async ({ data }: { data: { recordId: string } }) => { audits.push(data.recordId); } },
    };
    try { return await fn(tx as never); } finally { release(); }
  };
  return { exams, audits, keys, transaction };
}

const principal = (schoolId: string) => ({ userId: "u1", schoolId, role: "PRINCIPAL" }) as never;
const cls = { id: "class-qa01", name: "Grade 6", section: "A" };

test("two concurrent generations create one final exam and one audit", async () => {
  const db = fakeDb();
  const [a, b] = await Promise.all([1, 2].map(() => db.transaction((tx) => findOrCreateFinalExam(tx, principal("qa-01"), "campus-a", cls, 2026))));
  assert.equal(db.exams.length, 1);
  assert.deepEqual(db.audits, ["e1"]);
  assert.equal(a.exam.id, b.exam.id, "both requests reconcile onto the same exam, so report cards share it");
  assert.deepEqual([a.created, b.created].sort(), [false, true]);
});

test("a lost-response retry replays the existing exam", async () => {
  const db = fakeDb();
  const first = await db.transaction((tx) => findOrCreateFinalExam(tx, principal("qa-01"), "campus-a", cls, 2026));
  const retry = await db.transaction((tx) => findOrCreateFinalExam(tx, principal("qa-01"), "campus-a", cls, 2026));
  assert.equal(retry.exam.id, first.exam.id);
  assert.equal(retry.created, false);
  assert.equal(db.audits.length, 1);
});

test("two schools/campuses and two years are separate scopes", async () => {
  const db = fakeDb();
  await Promise.all([
    db.transaction((tx) => findOrCreateFinalExam(tx, principal("qa-01"), "campus-a", cls, 2026)),
    db.transaction((tx) => findOrCreateFinalExam(tx, principal("qa-02"), "campus-b", cls, 2026)),
    db.transaction((tx) => findOrCreateFinalExam(tx, principal("qa-01"), "campus-a", cls, 2025)),
  ]);
  assert.equal(db.exams.length, 3);
  assert.equal(new Set(db.keys).size, 3, "each scope has its own lock key");
});

test("the route locks exam and card writes together, maps conflicts to 409 and keeps the principal-only gate", () => {
  const src = readFileSync(join(__dirname, "..", "..", "src/app/api/reports/generate-from-grades/route.ts"), "utf8");
  assert.match(src, /versionTransaction\(async \(tx\) => \{\s*const \{ exam: finalExam \} = await findOrCreateFinalExam\(tx/, "exam and cards share one locked transaction");
  assert.match(src, /error instanceof ReportConflict[\s\S]*?status: 409/);
  assert.match(src, /if \(!\(await canLeadAcademics\(user, user\.campusId\)\)\) \{\s*return NextResponse\.json\([^)]*\{ status: 403 \}/);
  assert.doesNotMatch(src, /prisma\.exam\.findFirst\(\{\s*where: \{\s*campusId: user\.campusId,\s*classId,\s*academicYear: year/, "no unlocked find-then-create");
});
