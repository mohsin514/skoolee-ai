import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assessmentFixture } from "./assessment-fixture";

// SKAI-1883: Live Pulse works out which answers are present in SQL, so answer text never leaves the database.
// The stand-in database below runs the query's filters and the same blank pattern the SQL uses.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Row = Record<string, unknown>;
const paper = assessmentFixture("subject-1", "class-a").paper;
const assignments = [{ id: "exam-a", schoolId: "school-a", campusId: "campus-a", title: "A", startsAt: new Date(0), endsAt: new Date(1) }, { id: "exam-b", schoolId: "school-b", campusId: "campus-b", title: "B", startsAt: new Date(0), endsAt: new Date(1) }];
const attempts: Row[] = [];
const queries: Array<{ sql: string; values: unknown[] }> = [];
const tx = {
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    queries.push({ sql, values });
    const [pattern, schoolId, campusId, assignmentId] = values as string[];
    const blank = new RegExp(pattern);
    return attempts.filter(a => a.schoolId === schoolId && a.campusId === campusId && a.assignmentId === assignmentId && a.status === "IN_PROGRESS").slice(0, 2000)
      .map(a => ({ id: a.id, status: a.status, updatedAt: a.updatedAt, pausedAt: a.pausedAt, answered: Object.entries(a.responses as Row).filter(([, v]) => typeof v === "string" && !blank.test(v)).map(([k]) => k) }));
  },
  schoolAiExamAttempt: { findMany: async () => { throw new Error("the pulse must not read whole response documents"); } },
};
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_user: unknown, fn: (db: typeof tx) => unknown) => fn(tx) } });
mock.module(src("lib/school-ai/exam-service.ts"), { namedExports: { scopedAssignment: async (user: { schoolId: string; campusId: string; role: string }, id: string) => {
  const assignment = assignments.find(a => a.id === id && a.schoolId === user.schoolId && a.campusId === user.campusId);
  if (!assignment) throw Object.assign(new Error("Exam unavailable."), { status: 404 });
  return { assignment, paper, student: user.role === "STUDENT" ? { id: "s" } : null };
} } });

const load = () => import("../../src/lib/school-ai/exam-pulse-service");
const lead = { userId: "u-lead-a", role: "ADMIN", schoolId: "school-a", campusId: "campus-a" }, leadB = { ...lead, userId: "u-lead-b", schoolId: "school-b", campusId: "campus-b" };
const now = new Date("2026-10-23T10:00:00Z"), at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);

test("the blank pattern the SQL uses treats exactly the values JavaScript trim() empties as unanswered", async () => {
  const { BLANK_PATTERN } = await load();
  const blank = new RegExp(BLANK_PATTERN);
  for (let code = 0; code < 0x10000; code++) {
    if (code >= 0xd800 && code < 0xe000) continue;
    const value = ` ${String.fromCharCode(code)}\n`;
    assert.equal(!blank.test(value), value.trim().length > 0, `U+${code.toString(16)}`);
  }
  assert.equal(blank.test(""), true);
});

test("the pulse reads keys only, keeps school, campus and sitting scope, and counts as before", async () => {
  const { getExamPulse } = await load();
  attempts.push(
    { id: "x1", schoolId: "school-a", campusId: "campus-a", assignmentId: "exam-a", status: "IN_PROGRESS", updatedAt: at(1), pausedAt: null, responses: { q1: "a1", q3: "Long synthetic essay ".repeat(400) } },
    { id: "x2", schoolId: "school-a", campusId: "campus-a", assignmentId: "exam-a", status: "IN_PROGRESS", updatedAt: at(10), pausedAt: null, responses: { q1: "　 ", q2: "a2" } },
    { id: "x3", schoolId: "school-a", campusId: "campus-a", assignmentId: "exam-a", status: "SUBMITTED", updatedAt: at(1), pausedAt: null, responses: { q1: "a1" } },
    { id: "xb", schoolId: "school-b", campusId: "campus-b", assignmentId: "exam-b", status: "IN_PROGRESS", updatedAt: at(1), pausedAt: null, responses: { q1: "a1", q2: "a1", q3: "b" } },
  );
  const result = await getExamPulse(lead as never, "exam-a", now);
  const query = queries.at(-1)!;
  assert.deepEqual(query.values.slice(1), ["school-a", "campus-a", "exam-a"], "school, campus and sitting are bound parameters");
  assert.match(query.sql, /a\.school_id = \? AND a\.campus_id = \? AND a\.assignment_id = \? AND a\.status = 'IN_PROGRESS'/);
  assert.match(query.sql, /LIMIT 2000/);
  assert.doesNotMatch(query.sql.replace(/jsonb_\w+\(a\.responses\)|THEN a\.responses/g, ""), /responses/, "only keys are selected, never the responses column");
  assert.equal(result.pulse.live, 2);
  assert.deepEqual(result.pulse.questions.map(row => [row.questionId, row.answered]), [["q1", 1], ["q2", 1], ["q3", 1]], "a whitespace-only answer is not counted");
  assert.deepEqual(result.pulse.stalled, [{ attemptId: "x2", minutes: 10 }]);
  assert.equal(JSON.stringify(result).includes("essay"), false, "no answer text reaches the read model");
  const other = await getExamPulse(leadB as never, "exam-b", now);
  assert.equal(other.pulse.live, 1, "school B sees only its own sitting");
  assert.deepEqual(other.pulse.questions.map(row => row.answered), [1, 1, 1]);
});

test("another school, another campus and a student are denied before any attempt is read", async () => {
  const { getExamPulse } = await load();
  const before = queries.length;
  await assert.rejects(() => getExamPulse(leadB as never, "exam-a", now), { status: 404 });
  await assert.rejects(() => getExamPulse({ ...lead, campusId: "campus-b" } as never, "exam-a", now), { status: 404 });
  await assert.rejects(() => getExamPulse({ ...lead, role: "STUDENT" } as never, "exam-a", now), { status: 403 });
  assert.equal(queries.length, before);
});
