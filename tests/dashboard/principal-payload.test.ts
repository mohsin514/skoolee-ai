import { h, groupUser, loadDashboard, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * SKAI-1964: on a 2,000-pupil, 4-year school the principal console's server action returned 2.7 MB. Its classes
 * widget nested every class's roster (guardians and latest report card) and every exam, across every year, and
 * repeated the top-level roster; nothing read either nest. The campus mark average joined campuses on every load.
 */
const principals = [["standalone", user("PRINCIPAL")], ["group", groupUser("PRINCIPAL")]] as const;

for (const [label, session] of principals) {
  test(`SKAI-1964: the ${label} principal classes widget keeps counts, subjects and scope but no nested roster or exams`, async () => {
    const dashboard = await loadDashboard();
    h.session = session;
    const data = await dashboard.getPrincipalDashboardData();
    assert.deepEqual(data.degraded, []);
    const reads = h.calls.filter((call) => call.read === "class.findMany").map((call) => call.args);
    assert.equal(reads.length, 1, "one classes read");
    const [read] = reads;
    assert.deepEqual(read.where, { campusId: session.campusId, campus: { schoolId: session.schoolId } });
    assert.equal(read.where.academicYear, undefined, "classes from every year stay listed");
    assert.equal(read.include.students, undefined, "no nested roster");
    assert.equal(read.include.exams, undefined, "no nested exams");
    assert.ok(read.include.subjects, "subjects stay for the Classes panel");
    assert.ok(read.include.classTeacher, "class teacher stays");
    assert.ok(read.include._count.select.students, "class size stays");
  });

  test(`SKAI-1964: the ${label} campus mark average filters on the mark's own school and campus`, async () => {
    const dashboard = await loadDashboard();
    h.session = session;
    await dashboard.getPrincipalDashboardData();
    const reads = h.calls.filter((call) => call.read === "mark.aggregate").map((call) => call.args);
    assert.equal(reads.length, 1);
    assert.deepEqual(reads[0].where, { schoolId: session.schoolId, campusId: session.campusId });
    assert.deepEqual(reads[0]._avg, { marksObtained: true });
  });
}

test("SKAI-1964: the principal pages read class pupils from the top-level roster, not cls.students", () => {
  const page = readFileSync("src/app/principal/page.tsx", "utf8");
  assert.doesNotMatch(page, /c\.students\b|cls\.students\b|selectedClass\.students\b/);
  assert.match(page, /String\(c\._count\?\.students \?\? 0\)/, "the classes export counts on-roll pupils");
});

test("SKAI-1964: marks has a covering index for the campus average", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const mark = schema.slice(schema.indexOf("model Mark {"), schema.indexOf('@@map("marks")'));
  assert.match(mark, /@@index\(\[schoolId, campusId, marksObtained\]\)/);
  const sql = readFileSync("prisma/migrations/20261125020000_skai_1964_marks_average_index/migration.sql", "utf8");
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "marks_school_id_campus_id_marks_obtained_idx" ON "marks"\("school_id", "campus_id", "marks_obtained"\)/);
});
