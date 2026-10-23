import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSetupActions } from "../../src/lib/school-ai/setup-actions";
const answers = { curriculum: "Grade 1 A Mathematics total marks 100", resources: "Period 1 is 08:00-08:40" };
const plan = { action: "SUBJECTS", rows: [{ answer: "curriculum", quote: answers.curriculum, value: { classId: "class-a", subjectName: "Mathematics", totalMarks: 100 } }] };
test("next-stage proposals require existing class identities and exact answer evidence", () => {
 assert.equal(validateSetupActions({ plans: [plan], questions: [] }, answers, ["class-a"], "Questionnaire q v1").proposals[0].action, "SUBJECTS");
 assert.throws(() => validateSetupActions({ plans: [plan], questions: [] }, answers, ["another-class"], "Questionnaire q v1"));
 assert.throws(() => validateSetupActions({ plans: [plan], questions: [] }, { curriculum: "No subjects decided" }, ["class-a"], "Questionnaire q v1"));
});
test("unsupported action types, duplicate actions, and invalid periods are rejected", () => {
 assert.throws(() => validateSetupActions({ plans: [{ ...plan, action: "STAFF" }], questions: [] }, answers, ["class-a"], "Questionnaire q v1"));
 assert.throws(() => validateSetupActions({ plans: [plan, plan], questions: [] }, answers, ["class-a"], "Questionnaire q v1"));
 assert.throws(() => validateSetupActions({ plans: [{ action: "PERIODS", rows: [{ answer: "resources", quote: answers.resources, value: { timeType: "CLASS", periodNumber: 1, startTime: "09:00", endTime: "08:00" } }] }], questions: [] }, answers, [], "Questionnaire q v1"));
 assert.deepEqual(validateSetupActions({ plans: [], questions: ["What are the room dimensions?"] }, answers, [], "Questionnaire q v1").proposals, []);
});
