import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedContentTypes, artifactChecksum, effectiveDue, isLate, localToInstant, receiptCode, rubricIssues, rubricTotal, sameRubric, scoreIssues, sha256, type Criterion } from "../../src/lib/assignments/rules";

// SKO-409 pure rules: rubric validation, school-local deadlines, extensions and checksums.
const rubric: Criterion[] = [
  { id: "claim", title: "Claim", description: "States a testable claim.", maxPoints: 4 },
  { id: "evidence", title: "Evidence", description: "", maxPoints: 6 },
];

test("rubric totals and criterion ranges validate before publication", () => {
  assert.equal(rubricTotal(rubric), 10);
  assert.deepEqual(rubricIssues(rubric), []);
  assert.match(rubricIssues([]).join(), /at least one/);
  assert.match(rubricIssues([rubric[0], { ...rubric[1], id: "claim" }]).join(), /distinct id/);
  assert.match(rubricIssues(rubric, 12).join(), /add up to 10, not 12/);
  assert.equal(sameRubric(rubric, rubric.map(c => ({ ...c }))), true);
  assert.equal(sameRubric(rubric, [rubric[0], { ...rubric[1], maxPoints: 5 }]), false);
});

test("scores stay within each criterion and a return needs every criterion", () => {
  assert.deepEqual(scoreIssues(rubric, [{ criterionId: "claim", points: 3, comment: "" }], false), []);
  assert.match(scoreIssues(rubric, [{ criterionId: "claim", points: 5, comment: "" }], false).join(), /out of 4/);
  assert.match(scoreIssues(rubric, [{ criterionId: "style", points: 1, comment: "" }], false).join(), /Unknown criterion/);
  assert.match(scoreIssues(rubric, [{ criterionId: "claim", points: 3, comment: "" }], true).join(), /every criterion/);
});

test("deadlines are school-local wall times, including daylight-saving edges", () => {
  assert.equal(localToInstant("2026-10-20T23:59", "Asia/Karachi").toISOString(), "2026-10-20T18:59:00.000Z");
  assert.equal(localToInstant("2026-10-20T23:59", "Asia/Riyadh").toISOString(), "2026-10-20T20:59:00.000Z");
  assert.throws(() => localToInstant("2026-03-29T01:30", "Europe/London"), /does not exist/);
  // A repeated hour resolves to the later instant so a learner never loses time.
  assert.equal(localToInstant("2026-10-25T01:30", "Europe/London").toISOString(), "2026-10-25T01:30:00.000Z");
  assert.throws(() => localToInstant("2026-10-20 23:59", "Asia/Karachi"));
});

test("the newest extension is in force and late status follows the server receipt time", () => {
  const due = new Date("2026-10-20T20:00:00Z");
  const extensions = [{ dueAt: new Date("2026-10-22T20:00:00Z"), createdAt: new Date("2026-10-19T00:00:00Z") }, { dueAt: new Date("2026-10-21T20:00:00Z"), createdAt: new Date("2026-10-19T01:00:00Z") }];
  assert.equal(effectiveDue(due, []).toISOString(), due.toISOString());
  assert.equal(effectiveDue(due, extensions).toISOString(), "2026-10-21T20:00:00.000Z");
  assert.equal(isLate(new Date("2026-10-20T20:00:00Z"), due), false, "on the minute is on time");
  assert.equal(isLate(new Date("2026-10-20T20:00:01Z"), due), true);
});

test("an artifact checksum covers the file, the text, or both", () => {
  const file = sha256(Buffer.from("%PDF synthetic"));
  assert.equal(artifactChecksum("", file), file);
  assert.equal(artifactChecksum("My answer", null), sha256("My answer"));
  assert.notEqual(artifactChecksum("My answer", file), file);
  assert.match(receiptCode(), /^RC-[A-HJ-NP-Z2-9]{8}$/);
  assert.deepEqual(allowedContentTypes(["PDF", "TEXT"]), ["application/pdf", "text/plain"]);
});
