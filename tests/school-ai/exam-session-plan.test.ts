import assert from "node:assert/strict";
import { test } from "node:test";
import { examSessionPlanProposalSchema } from "../../src/lib/school-ai/exam-session-plan";
import { examSessionPlanCopy } from "../../src/components/school-ai/exam-session-plan-copy";
const proposal = { operation: "exams.create_session_plan", title: "Term exam", term: "TERM_1", academicYear: 2026, examType: "MID_TERM", papers: [{ id: "one", classId: "class", subjectId: "subject", date: "2026-10-14", periodDefinitionId: "period", rooms: [{ roomId: "room", invigilatorId: "teacher" }] }] };
test("exam plan accepts a real date and rejects impossible dates, unknown effects and incomplete rooms", () => {
  assert.equal(examSessionPlanProposalSchema.safeParse(proposal).success, true);
  for (const date of ["2026-02-29", "2026-13-01", "2026-10-32", "14/10/2026"]) assert.equal(examSessionPlanProposalSchema.safeParse({ ...proposal, papers: [{ ...proposal.papers[0], date }] }).success, false);
  assert.equal(examSessionPlanProposalSchema.safeParse({ ...proposal, publish: true }).success, false);
  assert.equal(examSessionPlanProposalSchema.safeParse({ ...proposal, papers: [{ ...proposal.papers[0], rooms: [] }] }).success, false);
});
test("exam plan refuses duplicate paper identity, subject, room and duty or oversized requests", () => {
  for (const paper of [proposal.papers[0], { ...proposal.papers[0], id: "two" }]) assert.equal(examSessionPlanProposalSchema.safeParse({ ...proposal, papers: [...proposal.papers, paper] }).success, false);
  for (const room of [{ roomId: "room", invigilatorId: "other" }, { roomId: "other", invigilatorId: "teacher" }]) assert.equal(examSessionPlanProposalSchema.safeParse({ ...proposal, papers: [{ ...proposal.papers[0], rooms: [...proposal.papers[0].rooms, room] }] }).success, false);
  assert.equal(examSessionPlanProposalSchema.safeParse({ ...proposal, papers: Array.from({ length: 11 }, (_, n) => ({ ...proposal.papers[0], id: `p${n}`, classId: `c${n}`, subjectId: `s${n}` })) }).success, false);
});
test("exam plan copy provides localized complete labels and explicit review in all supported languages", () => {
  const english = examSessionPlanCopy("en");
  for (const language of ["ar", "ur"] as const) {
    const copy = examSessionPlanCopy(language);
    assert.deepEqual(Object.keys(copy), Object.keys(english));
    for (const key of Object.keys(english) as Array<keyof typeof english>) { assert(copy[key].trim()); assert.notEqual(copy[key], english[key], key); }
  }
  assert.match(english.confirm, /draft/); assert.match(english.receiptHint, /No notifications/);
});
