import assert from "node:assert/strict";
import { test } from "node:test";
import { alignmentIssues, blueprintCoverageGaps, reuseAlignment, type ObjectiveDecision } from "../../src/lib/school-ai/question-bank";
import { assessmentFixture } from "./assessment-fixture";

// SKO-407 pure rules: reuse follows reviewed objective decisions; coverage gaps are specific.
const A1 = { curriculumId: "board-a", curriculumVersion: 1 }, A2 = { curriculumId: "board-a", curriculumVersion: 2 }, B1 = { curriculumId: "board-b", curriculumVersion: 1 };
const decision = (relation: string, minutes: number, extra: Partial<ObjectiveDecision> = {}): ObjectiveDecision => ({ fromRecordId: "board-b", fromVersion: 1, fromOutcomeId: "b-add", toRecordId: "board-a", toVersion: 1, toOutcomeId: "a-add", relation, createdAt: new Date(Date.UTC(2026, 9, 17, 0, minutes)), ...extra });

test("the same curriculum version needs no decision; a newer version keeps stable objective ids", () => {
  assert.deepEqual(reuseAlignment(A1, A1, ["a-add"], ["a-add"], []), { mode: "SAME_VERSION" });
  const next = reuseAlignment(A1, A2, ["a-add", "a-gone"], ["a-add", "a-new"], []);
  assert.equal(next.mode, "MAPPED");
  if (next.mode !== "MAPPED") return;
  assert.deepEqual(next.targets["a-add"], [{ outcomeId: "a-add", relation: "STABLE_ID" }]);
  assert.deepEqual(next.targets["a-gone"], [], "a retired objective has no target until a lead maps it");
  assert.match(alignmentIssues(next, [{ sourceOutcomeId: "a-add", targetOutcomeId: "a-new" }]).join(" "), /no recorded same or partial mapping/, "picking a different objective is refused");
  assert.deepEqual(alignmentIssues(next, [{ sourceOutcomeId: "a-add", targetOutcomeId: "a-add" }]), []);
});

test("another board needs a lead decision in either direction; the latest decision wins and NOT_EQUIVALENT blocks", () => {
  const none = reuseAlignment(A1, B1, ["a-add"], ["b-add"], []);
  assert.ok(none.mode === "MAPPED" && none.targets["a-add"].length === 0, "identical titles or codes never qualify");
  const mapped = reuseAlignment(A1, B1, ["a-add"], ["b-add"], [decision("PARTIAL", 1)]);
  assert.ok(mapped.mode === "MAPPED" && mapped.targets["a-add"][0].relation === "PARTIAL", "a decision recorded from B to A also applies from A to B");
  const revoked = reuseAlignment(A1, B1, ["a-add"], ["b-add"], [decision("SAME", 1), decision("NOT_EQUIVALENT", 2)]);
  assert.ok(revoked.mode === "MAPPED" && revoked.targets["a-add"].length === 0, "the later NOT_EQUIVALENT decision replaces the earlier SAME");
  const otherVersion = reuseAlignment(A1, B1, ["a-add"], ["b-add"], [decision("SAME", 1, { fromVersion: 2 })]);
  assert.ok(otherVersion.mode === "MAPPED" && otherVersion.targets["a-add"].length === 0, "a decision for another version does not apply");
});

test("coverage gaps name the missing objective and the marks, plus unfilled slots", () => {
  const { curriculum, paper } = assessmentFixture();
  curriculum.outcomes.push({ id: "outcome-2", title: "Compare numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: true });
  assert.deepEqual(blueprintCoverageGaps(paper, curriculum), []);
  paper.blueprint.sections[0].outcomeIds = ["outcome-1", "outcome-2"];
  paper.questions = paper.questions.filter(question => question.id !== "q3");
  assert.deepEqual(blueprintCoverageGaps(paper, curriculum).map(gap => [gap.sectionId, gap.outcomeTitle, gap.missingMarks]), [["a", "Compare numbers", 2], ["b", "Add whole numbers", 3], ["b", null, 3]]);
});
