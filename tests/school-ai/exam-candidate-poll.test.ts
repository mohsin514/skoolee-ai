import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assessmentFixture } from "./assessment-fixture";

// SKAI-1882: a candidate's polled reads (exam notices, recording status) keep every membership check but no
// longer load or parse the frozen paper on each poll, and the recording summary never carries the clip list.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Row = Record<string, unknown>;
type User = { userId: string; role: "STUDENT" | "TEACHER"; schoolId: string; campusId: string; email: string; accessVersion: number };
const selects: Row[] = [];
const clipQueries: Row[] = [];
const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([key, cond]) => {
  if (cond && typeof cond === "object" && "in" in (cond as Row)) return (cond as { in: unknown[] }).in.includes(row[key]);
  return row[key] === cond;
});
const pick = (row: Row, select?: Row) => select ? Object.fromEntries(Object.keys(select).filter(key => key in row).map(key => [key, row[key]])) : { ...row };
const tables: Record<string, Row[]> = { schoolAiExamAssignment: [], student: [], user: [], schoolAiExamClarification: [], schoolAiExamAttempt: [], schoolAiExamClarificationAck: [], schoolAiProctorSession: [], schoolAiProctorClip: [] };
const model = (name: string) => ({
  findFirst: async (args: { where?: Row; select?: Row } = {}) => {
    if (name === "schoolAiExamAssignment") selects.push(args.select ?? { "*": true });
    const row = tables[name].find(r => matches(r, args.where)); return row ? pick(row, args.select) : null;
  },
  findMany: async (args: { where?: Row; select?: Row; include?: { clips?: Row & { take?: number } } } = {}) => {
    const rows = tables[name].filter(r => matches(r, args.where));
    if (name !== "schoolAiProctorSession") return rows.map(r => pick(r, args.select));
    clipQueries.push(args.include?.clips ?? {});
    return rows.map(r => ({ ...r, attempt: tables.schoolAiExamAttempt.find(a => a.id === r.attemptId), clips: tables.schoolAiProctorClip.filter(c => c.sessionId === r.id && c.status === "READY").slice(0, args.include?.clips?.take ?? Infinity) }));
  },
  count: async (args: { where?: Row } = {}) => tables[name].filter(r => matches(r, args.where)).length,
});
const db = Object.fromEntries(Object.keys(tables).map(name => [name, model(name)]));
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_user: unknown, fn: (tx: typeof db) => unknown) => fn(db), retryDatabaseTransaction: async (fn: () => unknown) => fn() } });
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: db, RLS_ENABLED: false, tenantTransaction: async (fn: (tx: typeof db) => unknown) => fn(db), validateReferences: async () => undefined } });

const load = async () => ({ ...(await import("../../src/lib/school-ai/exam-incident-service")), ...(await import("../../src/lib/school-ai/exam-proctor-service")), ...(await import("../../src/lib/school-ai/exam-service")) });
const user = (id: string, schoolId: string, campusId: string, role: User["role"] = "STUDENT"): User => ({ userId: id, role, schoolId, campusId, email: `${id}@example.invalid`, accessVersion: 0 });
const pupil = user("u-pupil-a", "school-a", "campus-a"), outsider = user("u-pupil-other", "school-a", "campus-a"), twin = user("u-pupil-b", "school-b", "campus-b"), teacher = user("u-teacher-a", "school-a", "campus-a", "TEACHER");
const paper = assessmentFixture("subject-1", "class-a").paper;

function seed() {
  for (const rows of Object.values(tables)) rows.length = 0;
  selects.length = 0; clipQueries.length = 0;
  for (const [u, studentId, classId] of [[pupil, "s-a", "class-a"], [outsider, "s-out", "class-a"], [twin, "s-b", "class-b"]] as const) {
    tables.user.push({ id: u.userId, schoolId: u.schoolId, campusId: u.campusId, role: u.role, isActive: true, accessVersion: 0 });
    tables.student.push({ id: studentId, schoolId: u.schoolId, campusId: u.campusId, classId, studentUserId: u.userId, archivedAt: null, status: "active" });
  }
  const assignment = (id: string, schoolId: string, campusId: string, classId: string, studentIds: string[]) => ({ id, schoolId, campusId, classId, studentIds, status: "ACTIVE", mode: "STANDARD", version: 3, proctorPolicy: { enabled: true, camera: true, screen: false, retentionDays: 7 }, paperSnapshot: paper, createdById: "u-teacher-a" });
  tables.schoolAiExamAssignment.push(assignment("exam-a", "school-a", "campus-a", "class-a", ["s-a"]), assignment("exam-b", "school-b", "campus-b", "class-b", ["s-b"]));
  tables.schoolAiExamAttempt.push({ id: "att-a", assignmentId: "exam-a", schoolId: "school-a", campusId: "campus-a", studentId: "s-a", userId: pupil.userId, status: "IN_PROGRESS", pausedAt: null, deadlineAt: new Date(Date.now() + 3_600_000) });
  tables.schoolAiExamAttempt.push({ id: "att-b", assignmentId: "exam-b", schoolId: "school-b", campusId: "campus-b", studentId: "s-b", userId: twin.userId, status: "IN_PROGRESS", pausedAt: null, deadlineAt: new Date(Date.now() + 3_600_000) });
}
const notice = (id: string, version: number, questionId: string | null, assignmentId = "exam-a", schoolId = "school-a", campusId = "campus-a") => ({ id, version, questionId, assignmentId, schoolId, campusId, revisesId: null, text: `Notice ${id}`, audience: { kind: "SITTING" }, createdAt: new Date(0), issuedById: "u-teacher-a" });
const loadsPaper = () => selects.some(select => "*" in select || "paperSnapshot" in select);

test("a candidate's notice poll never loads the paper unless a notice names a question, and numbers stay the same", async () => {
  const { listClarifications } = await load();
  seed(); tables.schoolAiExamClarification.push(notice("n1", 1, null));
  const plain = await listClarifications(pupil as never, "exam-a") as { notices: Array<{ id: string; question: number | null }>; deadlineAt: Date | null };
  assert.deepEqual(plain.notices.map(row => [row.id, row.question]), [["n1", null]]);
  assert.ok(plain.deadlineAt, "the deadline still travels with the poll (SKO-502)");
  assert.equal(loadsPaper(), false, "no paper snapshot is read for a notice without a question");
  seed(); tables.schoolAiExamClarification.push(notice("n1", 1, null), notice("n2", 2, "q2"), notice("n3", 3, "missing"));
  const numbered = await listClarifications(pupil as never, "exam-a") as { notices: Array<{ id: string; question: number | null }> };
  assert.deepEqual(numbered.notices.map(row => [row.id, row.question]), [["n1", null], ["n2", 2], ["n3", null]]);
  assert.deepEqual(selects.filter(select => "paperSnapshot" in select), [{ paperSnapshot: true }], "the paper is read once, only for numbering");
});

test("tenant, campus and membership checks still deny other schools, non-members and staff on the candidate path", async () => {
  const { listClarifications, candidateAssignment } = await load();
  seed(); tables.schoolAiExamClarification.push(notice("n1", 1, null), notice("nb", 1, null, "exam-b", "school-b", "campus-b"));
  await assert.rejects(() => listClarifications(twin as never, "exam-a"), { status: 404 }, "school B cannot read school A's exam");
  await assert.rejects(() => listClarifications({ ...pupil, campusId: "campus-b" } as never, "exam-a"), { status: 404 }, "another campus cannot read it");
  await assert.rejects(() => listClarifications(outsider as never, "exam-a"), { status: 404 }, "a classmate outside the sitting is denied");
  const own = await listClarifications(twin as never, "exam-b") as { notices: Array<{ id: string }> };
  assert.deepEqual(own.notices.map(row => row.id), ["nb"], "school B sees only its own notices");
  await assert.rejects(() => candidateAssignment(teacher as never, "exam-a"), { status: 403 }, "the candidate path is for student accounts only");
  tables.schoolAiExamAssignment[0].status = "CLOSED";
  await assert.rejects(() => listClarifications(pupil as never, "exam-a"), { status: 404 });
});

test("the recording-status summary carries counts, not the growing clip list, and a full read is unchanged", async () => {
  const { getExamProctor } = await load();
  seed();
  tables.schoolAiProctorSession.push({ id: "ps-a", schoolId: "school-a", assignmentId: "exam-a", attemptId: "att-a", userId: pupil.userId, kind: "CAMERA", status: "ACTIVE", consentedAt: new Date(1), retentionUntil: new Date(Date.now() + 86_400_000), endedAt: null, bytes: 3600, clipCount: 360, reviewNote: null, reviewedAt: null });
  tables.schoolAiProctorSession.push({ id: "ps-b", schoolId: "school-b", assignmentId: "exam-b", attemptId: "att-b", userId: twin.userId, kind: "CAMERA", status: "ACTIVE", consentedAt: new Date(1), retentionUntil: new Date(Date.now() + 86_400_000), endedAt: null, bytes: 10, clipCount: 1, reviewNote: null, reviewedAt: null });
  for (let sequence = 0; sequence < 360; sequence++) tables.schoolAiProctorClip.push({ id: `c${sequence}`, sessionId: "ps-a", sequence, status: "READY", createdAt: new Date(sequence), bytes: 10 });
  const summary = await getExamProctor(pupil as never, "exam-a", undefined, true);
  assert.deepEqual(summary.sessions.map(s => [s.id, s.status, s.clipCount, s.clips.length]), [["ps-a", "ACTIVE", 360, 0]]);
  assert.equal(clipQueries.at(-1)?.take, 0, "the summary asks the database for no clip rows");
  assert.equal(loadsPaper(), false, "the candidate's recording poll never reads the paper");
  assert.equal(summary.policy.camera, true); assert.equal(summary.version, 3);
  const full = await getExamProctor(pupil as never, "exam-a");
  assert.equal(full.sessions[0].clips.length, 360, "without summary the candidate still gets every clip to replay");
  assert.equal(clipQueries.at(-1)?.take, undefined);
  const other = await getExamProctor(twin as never, "exam-b", undefined, true);
  assert.deepEqual(other.sessions.map(s => s.id), ["ps-b"], "school B's summary holds only its own session");
  await assert.rejects(() => getExamProctor(twin as never, "exam-a", undefined, true), { status: 404 });
});
