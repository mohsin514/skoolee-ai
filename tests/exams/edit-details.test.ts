import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { diffExamDetails, examDetailsEditSchema, isExamDetailsEdit } from "@/lib/exams/edit-details";
import * as editDetails from "@/lib/exams/edit-details";

// SKAI-1120: PATCH /api/exams edits title / term / examType of non-locked exams, with an audit event.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/app/api/exams/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type Exam = { id: string; schoolId: string; campusId: string; classId: string; title: string; term: string; examType: string; isLocked: boolean; status: string };

function load(opts: { role?: string; exam?: Partial<Exam> } = {}) {
  const exam: Exam = { id: "e-1", schoolId: "school-a", campusId: "campus-a", classId: "c-1", title: "Mid", term: "Term 1", examType: "MID_TERM", isLocked: false, status: "ACTIVE", ...opts.exam };
  const audits: any[] = [];
  const tx = {
    exam: {
      findFirst: async ({ where }: any) => (where.id === exam.id && where.schoolId === exam.schoolId ? { ...exam } : null),
      updateMany: async ({ where, data }: any) => {
        if (where.schoolId !== exam.schoolId || exam.isLocked !== where.isLocked) return { count: 0 };
        Object.assign(exam, data);
        return { count: 1 };
      },
    },
    class: { findFirst: async () => ({ id: "c-1" }) },
  };
  const db = { $transaction: (fn: any) => fn(tx), exam: tx.exam };
  const user = { userId: "u-1", role: opts.role ?? "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" };
  const mod = { exports: {} as any };
  const stubs: Record<string, unknown> = {
    "@/lib/db/prisma": { prisma: db },
    "@/lib/auth": { getAuthUser: async () => user },
    "@/lib/billing/response": { billingAccessResponse: async () => null },
    "@/lib/permissions": { assertPermission: async () => {} },
    "@/lib/audit-events": { writeAuditEvent: async (_tx: unknown, _u: unknown, e: unknown) => { audits.push(e); } },
    "@/lib/api/scope": { ApiError, canLeadAcademics: async () => true, assertSharedModuleRead: async () => {} },
    "@/lib/academic/exam-bookings": { validateStoredExamSchedules: async () => {} },
    "@/lib/academic/exam-scheduling-write": { withExamSchedulingWrite: async () => { throw new Error("not used"); } },
    "@/lib/academic/report-versions": {},
    "@/lib/auth/policy": { studentScope: () => ({}) },
    "@/lib/roles": { isCampusAdminRole: (r: string) => r === "CAMPUS_ADMIN" },
    "@/lib/validators/schemas": { examSchema: {}, examStatusSchema: { safeParse: () => ({ success: false, error: { flatten: () => ({ fieldErrors: {} }) } }) } },
    "@/lib/exams/create-command": {},
    "@/lib/exams/edit-details": editDetails,
    "@/lib/academic/exam-permissions": {
      canManageExamType: (role: string, type: string) => role !== "TEACHER" || type === "QUIZ" || type === "CLASS_TEST",
      isOfficeRole: () => true,
      TERM_EXAM_DENIED_MESSAGE: "denied",
    },
  };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => (id in stubs ? stubs[id] : require(id)));
  const patch = (body: unknown) => mod.exports.PATCH({ json: async () => body });
  return { patch, exam, audits };
}

test("schema rejects schedule fields and empty edits", () => {
  assert.equal(examDetailsEditSchema.safeParse({ id: "e", maxMarks: 50 }).success, false);
  assert.equal(examDetailsEditSchema.safeParse({ id: "e", startDate: "2026-01-01", title: "x" }).success, false);
  assert.equal(examDetailsEditSchema.safeParse({ id: "e" }).success, false);
  assert.equal(isExamDetailsEdit({ id: "e", status: "ACTIVE" }), false);
  assert.equal(isExamDetailsEdit({ id: "e", title: "New" }), true);
  assert.deepEqual(diffExamDetails({ title: "A", term: "T", examType: "QUIZ" }, { id: "e", title: "A", term: "T2" }).after, { term: "T2" });
});

test("edits title, term and examType and writes an audit event", async () => {
  const f = load();
  const res = await f.patch({ id: "e-1", title: "Mid-term exam", term: "Term 2", examType: "FINAL" });
  assert.equal(res.status, 200);
  assert.equal(f.exam.title, "Mid-term exam");
  assert.equal(f.exam.term, "Term 2");
  assert.equal(f.exam.examType, "FINAL");
  assert.equal(f.audits.length, 1);
  assert.deepEqual(f.audits[0].before, { title: "Mid", term: "Term 1", examType: "MID_TERM" });
  assert.equal(f.audits[0].table, "exams");
});

test("locked exams are rejected with 409 and not audited", async () => {
  const f = load({ exam: { isLocked: true } });
  const res = await f.patch({ id: "e-1", title: "Changed" });
  assert.equal(res.status, 409);
  assert.equal(f.exam.title, "Mid");
  assert.equal(f.audits.length, 0);
});

test("exam in another school is not found", async () => {
  const f = load({ exam: { schoolId: "school-b" } });
  assert.equal((await f.patch({ id: "e-1", title: "x" })).status, 404);
});

test("exam in another campus is denied", async () => {
  const f = load({ exam: { campusId: "campus-b" } });
  assert.equal((await f.patch({ id: "e-1", title: "x" })).status, 403);
});

test("teacher cannot promote a class test to a term exam", async () => {
  const f = load({ role: "TEACHER", exam: { examType: "CLASS_TEST" } });
  assert.equal((await f.patch({ id: "e-1", examType: "FINAL" })).status, 403);
  assert.equal(f.exam.examType, "CLASS_TEST");
});

test("denied role is blocked", async () => {
  const f = load({ role: "ACCOUNTANT" });
  assert.equal((await f.patch({ id: "e-1", title: "x" })).status, 403);
});
