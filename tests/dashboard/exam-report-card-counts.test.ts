import { h, groupUser, loadDashboard, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * SKAI-1965: the admin console's recent exams and the principal console's review exams counted report cards with a
 * relation `_count`, which Prisma runs as an aggregate over every school's report cards. They now count with one
 * groupBy limited to the caller's school and the listed exam ids, and keep `_count.reportCards`.
 */

const cards = [
  { schoolId: "school-standalone", examId: "ex-1" },
  { schoolId: "school-standalone", examId: "ex-1" },
  { schoolId: "school-standalone", examId: "ex-2" },
  // Another school's card on a colliding exam id must not be counted.
  { schoolId: "school-group", examId: "ex-1" },
];

function answerExamCounts() {
  h.answers.set("exam.findMany", () => [{ id: "ex-1", title: "Mid term", class: { id: "c1", name: "Grade 6", section: "A" } }, { id: "ex-3", title: "Quiz", class: { id: "c1", name: "Grade 6", section: "A" } }]);
  h.answers.set("reportCard.groupBy", (args) => {
    if (args.by[0] !== "examId") return [];
    const counts = new Map<string, number>();
    for (const card of cards.filter((c) => c.schoolId === args.where.schoolId && args.where.examId.in.includes(c.examId))) counts.set(card.examId, (counts.get(card.examId) ?? 0) + 1);
    return [...counts].map(([examId, n]) => ({ examId, _count: { _all: n } }));
  });
}

const consoles = [
  ["admin", "getCampusDashboardData", "recentExams", user("ADMIN", { isInstitutionOwner: true }), { "ex-1": 2, "ex-3": 0 }],
  ["principal", "getPrincipalDashboardData", "reviewExams", user("PRINCIPAL"), { "ex-1": 2, "ex-3": 0 }],
  ["group principal", "getPrincipalDashboardData", "reviewExams", groupUser("PRINCIPAL"), { "ex-1": 1, "ex-3": 0 }],
] as const;

for (const [label, loader, key, session, expected] of consoles) {
  test(`SKAI-1965: ${label} console counts ${key} report cards in its own school only`, async () => {
    const dashboard = await loadDashboard();
    h.session = session;
    answerExamCounts();
    const data: any = await dashboard[loader]();

    assert.deepEqual(data.degraded, []);
    assert.deepEqual(Object.fromEntries(data[key].map((exam: any) => [exam.id, exam._count])), Object.fromEntries(Object.entries(expected).map(([id, n]) => [id, { reportCards: n }])));
    const examReads = h.calls.filter((call) => call.read === "exam.findMany");
    assert.ok(examReads.every((call) => !(call.args.select ?? call.args.include)?._count?.select?.reportCards), "no relation _count of report cards");
    const counts = h.calls.filter((call) => call.read === "reportCard.groupBy" && call.args.by[0] === "examId");
    assert.ok(counts.length >= 1);
    for (const call of counts) assert.deepEqual(call.args.where, { schoolId: session.schoolId, examId: { in: ["ex-1", "ex-3"] } });
  });
}

test("SKAI-1965: a denied role reads no exam report-card counts", async () => {
  const dashboard = await loadDashboard();
  h.session = user("TEACHER");
  answerExamCounts();
  await assert.rejects(() => dashboard.getCampusDashboardData());
  await assert.rejects(() => dashboard.getPrincipalDashboardData());
  assert.equal(h.calls.some((call) => call.read.startsWith("reportCard.")), false);
});
