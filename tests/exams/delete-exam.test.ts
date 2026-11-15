import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-1999: DELETE /api/exams?id= discards an unlocked exam that has no marks or report cards.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/app/api/exams/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type Exam = { id: string; schoolId: string; campusId: string; classId: string; title: string; term: string; examType: string; isLocked: boolean; status: string };

function load(opts: { role?: string; exam?: Partial<Exam>; marks?: number; reportCards?: number; assigned?: boolean } = {}) {
  const state = { exam: { id: "e-1", schoolId: "school-a", campusId: "campus-a", classId: "c-1", title: "Quiz", term: "Term 1", examType: "QUIZ", isLocked: false, status: "ACTIVE", ...opts.exam } as Exam | null };
  const audits: any[] = [];
  const tx = {
    exam: {
      findFirst: async ({ where }: any) => (state.exam && where.id === state.exam.id && where.schoolId === state.exam.schoolId ? { ...state.exam } : null),
      deleteMany: async ({ where }: any) => {
        if (!state.exam || where.schoolId !== state.exam.schoolId || where.isLocked !== state.exam.isLocked) return { count: 0 };
        state.exam = null;
        return { count: 1 };
      },
    },
    mark: { findFirst: async () => (opts.marks ? { id: "m-1" } : null) },
    reportCard: { findFirst: async () => (opts.reportCards ? { id: "r-1" } : null) },
    class: { findFirst: async () => (opts.assigned === false ? null : { id: "c-1" }) },
  };
  const db = { $transaction: (fn: any) => fn(tx), exam: tx.exam, mark: tx.mark };
  const user = { userId: "u-1", role: opts.role ?? "TEACHER", schoolId: "school-a", campusId: "campus-a" };
  const mod = { exports: {} as any };
  const stubs: Record<string, unknown> = {
    "@/lib/db/prisma": { prisma: db },
    "@/lib/auth": { getAuthUser: async () => user },
    "@/lib/billing/response": { billingAccessResponse: async () => null },
    "@/lib/permissions": { assertPermission: async () => {} },
    "@/lib/audit-events": { writeAuditEvent: async (_tx: unknown, _u: unknown, e: unknown) => { audits.push(e); } },
    "@/lib/api/scope": { ApiError, canLeadAcademics: async () => true, assertSharedModuleRead: async () => {} },
    "@/lib/academic/exam-bookings": {},
    "@/lib/academic/exam-scheduling-write": {},
    "@/lib/academic/report-versions": {},
    "@/lib/auth/policy": { studentScope: () => ({}) },
    "@/lib/roles": { isCampusAdminRole: (r: string) => r === "CAMPUS_ADMIN" },
    "@/lib/validators/schemas": { examSchema: {}, examStatusSchema: {} },
    "@/lib/exams/create-command": {},
    "@/lib/exams/edit-details": {},
    "@/lib/api/validate": {},
    "@/lib/validators/route-bodies": {},
    "@/lib/academic/model-service": {},
    "@/lib/academic/exam-permissions": {
      canManageExamType: (role: string, type: string) => role !== "TEACHER" || type === "QUIZ" || type === "CLASS_TEST",
      isOfficeRole: () => true,
      TERM_EXAM_DENIED_MESSAGE: "denied",
    },
  };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => (id in stubs ? stubs[id] : require(id)));
  const del = (id: string | null = "e-1") => mod.exports.DELETE({ url: `http://x/api/exams${id ? `?id=${id}` : ""}` });
  return { del, state, audits };
}

test("teacher deletes their own unlocked test with no marks, audited", async () => {
  const f = load();
  const res = await f.del();
  assert.equal(res.status, 200);
  assert.equal(f.state.exam, null);
  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].action, "DELETE");
  assert.equal(f.audits[0].table, "exams");
});

test("an exam with marks is kept", async () => {
  const f = load({ marks: 3 });
  assert.equal((await f.del()).status, 409);
  assert.ok(f.state.exam);
  assert.equal(f.audits.length, 0);
});

test("an exam with report cards is kept", async () => {
  const f = load({ reportCards: 1 });
  assert.equal((await f.del()).status, 409);
  assert.ok(f.state.exam);
});

test("locked and published exams are kept", async () => {
  assert.equal((await load({ exam: { isLocked: true } }).del()).status, 409);
  assert.equal((await load({ exam: { status: "PUBLISHED" } }).del()).status, 409);
});

test("teacher cannot delete a term exam or one in a class they do not teach", async () => {
  assert.equal((await load({ exam: { examType: "MID_TERM" } }).del()).status, 403);
  assert.equal((await load({ assigned: false }).del()).status, 403);
});

test("other school, other campus, missing id and denied role", async () => {
  assert.equal((await load({ exam: { schoolId: "school-b" } }).del()).status, 404);
  assert.equal((await load({ exam: { campusId: "campus-b" } }).del()).status, 403);
  assert.equal((await load().del(null)).status, 400);
  assert.equal((await load({ role: "ACCOUNTANT" }).del()).status, 403);
});
