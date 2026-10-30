import assert from "node:assert/strict";
import { test } from "node:test";
import { curriculumDataSchema, objectiveStructureIssues, validateCurriculumApproval, type CurriculumData } from "../../src/lib/school-ai/assessment";
import { compareVersions, objectiveCoverage, topicOutcome, unmappedWork, versionImpact, type PaperRef, type ReleaseRef } from "../../src/lib/curriculum/objective-map";
import { assessmentFixture } from "../school-ai/assessment-fixture";

// SKO-406 pure rules: structure checks, separate coverage states, version comparison and impact.
function curriculum(): CurriculumData {
  const { curriculum } = assessmentFixture();
  curriculum.outcomes = [
    { id: "o-add", code: "SYN.M.1", title: "Add whole numbers", description: "Learners add two whole numbers.", sourceId: "source-1", sourcePage: "1", included: true, taught: true },
    { id: "o-sub", code: "SYN.M.2", title: "Subtract whole numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: true, prerequisiteIds: ["o-add"] },
    { id: "o-mul", code: "SYN.M.3", title: "Multiply whole numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: false, prerequisiteIds: ["o-add"] },
  ];
  curriculum.sectionCoverage = [{ section: "Week 1", outcomeIds: ["o-add"], taughtOn: "2026-10-05", confirmed: true }, { section: "Week 2", outcomeIds: ["o-sub"], taughtOn: "2026-10-12", confirmed: false }];
  return curriculum;
}
function paper(id: string, outcomeIds: string[][], curriculumVersion = 2): PaperRef {
  const { paper } = assessmentFixture();
  paper.curriculumId = "cur"; paper.curriculumVersion = curriculumVersion;
  paper.questions = paper.questions.map((question, index) => ({ ...question, outcomeIds: outcomeIds[index] ?? [] }));
  return { id, title: `Paper ${id}`, version: 1, status: "APPROVED", data: paper };
}

test("the schema accepts optional codes, descriptions, prerequisites and pack details without breaking older records", () => {
  assert.equal(curriculumDataSchema.safeParse(assessmentFixture().curriculum).success, true, "a record without the new fields stays valid");
  assert.equal(curriculumDataSchema.safeParse({ ...curriculum(), pack: { authority: "Synthetic board", edition: "2026", language: "ur", rights: "UNDER_REVIEW" } }).success, true);
});

test("FBISE Grade 9 pack requires immutable year and reviewed rights evidence", () => {
  const data = curriculum();
  data.sectionCoverage = [];
  data.pack = { packId: "fbise-g9-math-2026", version: 1, authority: "FBISE", edition: "2026", language: "en", rights: "APPROVED", examYear: "2026", teachingYear: "2026-27" };
  assert.match(validateCurriculumApproval(data).join(" "), /URL, checksum, rights scope and review metadata/);
  data.sources = data.sources.map(source => ({ ...source, url: "https://example.test/fbise/g9", checksum: "a".repeat(64), rightsScope: "QA-01 synthetic schools", reviewedAt: "2026-10-01T00:00:00.000Z" }));
  assert.deepEqual(validateCurriculumApproval(data), []);
  assert.match(validateCurriculumApproval({ ...data, pack: { ...data.pack, examYear: "2026-27" } }).join(" "), /distinct from teaching year/);
});

test("BISE Lahore Grade 9 packs pin the examination contract and keep 2026 rules historical", () => {
  const data = curriculum();
  data.sectionCoverage = [];
  data.pack = { packId: "bise-lahore-g9-maths", version: 1, authority: "BISE Lahore", edition: "2027-annual", language: "ur", rights: "APPROVED", examYear: "2027", teachingYear: "2026-27", grade: "9", term: "Annual", marks: 100, durationMinutes: 180, choices: 2, paperRules: "Approved scheme and model-paper rules" };
  data.sources = data.sources.map(source => ({ ...source, url: "https://example.test/bise-lahore", checksum: "a".repeat(64), rightsScope: "QA-01 schools", reviewedAt: "2026-10-01T00:00:00.000Z", authoritativeNotice: "BISE Lahore notification 2027" }));
  assert.deepEqual(validateCurriculumApproval(data), []);
  assert.match(validateCurriculumApproval({ ...data, pack: { ...data.pack, marks: 75, edition: "annual-exam-2026", examYear: "2027" } }).join(" "), /historical/);
  assert.match(validateCurriculumApproval({ ...data, pack: { ...data.pack, choices: undefined } }).join(" "), /marks, duration and choice/);
  assert.match(validateCurriculumApproval({ ...data, sources: data.sources.map(source => ({ ...source, authoritativeNotice: undefined })) }).join(" "), /authority notice/);
});

test("duplicate codes, unknown prerequisites and cycles are explained before approval", () => {
  assert.deepEqual(objectiveStructureIssues(curriculum()), []);
  const duplicate = curriculum(); duplicate.outcomes[2].code = "syn.m.1";
  assert.match(objectiveStructureIssues(duplicate).join(" "), /codes must be unique/);
  const unknown = curriculum(); unknown.outcomes[1].prerequisiteIds = ["missing"];
  assert.match(objectiveStructureIssues(unknown).join(" "), /not in this curriculum/);
  const cycle = curriculum(); cycle.outcomes[0].prerequisiteIds = ["o-sub"];
  assert.match(objectiveStructureIssues(cycle).join(" "), /cycle/);
  assert.match(validateCurriculumApproval(cycle).join(" "), /cycle/, "approval refuses a cycle");
});

test("planned, taught and assessed coverage stay separate; one resource counts once per objective", () => {
  const data = curriculum();
  const released = paper("p-released", [["o-add"], ["o-add", "o-sub"], []]);
  const draft = paper("p-draft", [["o-mul"], [], []]);
  const releases: ReleaseRef[] = [{ id: "assign-1", paperId: released.id, paperVersion: 1, snapshot: released.data }];
  const topics = [{ id: "t1", title: "Add whole numbers", status: "COMPLETED", description: "Curriculum source: x\nref\nApproved workspace cur, version 2; outcome o-add." }, { id: "t2", title: "Multiply", status: "NOT_STARTED", description: "Approved workspace cur, version 2; outcome o-mul." }, { id: "t3", title: "Other curriculum", status: "NOT_STARTED", description: "Approved workspace other, version 1; outcome o-add." }];
  const resources = [{ id: "r1", title: "Number line", status: "PUBLISHED", objectives: { curriculumId: "cur", curriculumVersion: 2, outcomeIds: ["o-add", "o-sub"] } }];
  const coverage = objectiveCoverage("cur", data, 2, { topics, releases, papers: [released, draft], resources });
  const of = (id: string) => coverage.find(row => row.outcomeId === id)!;
  assert.deepEqual(of("o-add").planned.topics.map(topic => topic.id), ["t1"], "another curriculum's topic is not counted");
  assert.equal(of("o-add").taught.sections.length, 1);
  assert.equal(of("o-sub").taught.sections.length, 0, "an unconfirmed coverage row is not teaching evidence");
  assert.deepEqual(of("o-add").assessed.releases, [{ assignmentId: "assign-1", paperId: "p-released", paperVersion: 1, questions: 2 }]);
  assert.equal(of("o-sub").assessed.releases[0].questions, 1);
  assert.equal(of("o-mul").assessed.releases.length, 0, "a draft paper is not assessment evidence");
  assert.equal(of("o-mul").drafts.length, 1);
  assert.equal(of("o-mul").planned.topics.length, 1, "planned without teaching stays planned");
  assert.deepEqual([of("o-add").resources.length, of("o-sub").resources.length, of("o-mul").resources.length], [1, 1, 0]);
  assert.equal(topicOutcome("Approved workspace cur, version 3; outcome o-add.", "cur"), "o-add");
  assert.equal(topicOutcome("Approved workspace cur, version 3; outcome o-add.", "other"), null);
});

test("unmapped questions and resources are listed for review, never guessed from titles", () => {
  const data = curriculum();
  const unmapped = unmappedWork("cur", data, { papers: [paper("p", [["o-add"], [], ["gone"]])], resources: [
    { id: "r-none", title: "Add whole numbers worksheet", status: "PUBLISHED", objectives: null },
    { id: "r-other", title: "Other", status: "DRAFT", objectives: { curriculumId: "other", curriculumVersion: 1, outcomeIds: ["x"] } },
    { id: "r-ok", title: "Mapped", status: "PUBLISHED", objectives: { curriculumId: "cur", curriculumVersion: 2, outcomeIds: ["o-add"] } },
    { id: "r-retired", title: "Retired", status: "RETIRED", objectives: null },
  ] });
  assert.deepEqual(unmapped.questions.map(row => row.questionId), ["q2", "q3"]);
  assert.deepEqual(unmapped.resources.map(row => row.id), ["r-none", "r-other"], "a title matching an objective is still unmapped");
});

test("renames are changes to the same objective; unreleased papers on old versions need review, released ones are preserved", () => {
  const before = curriculum(), after = curriculum();
  after.outcomes[0] = { ...after.outcomes[0], title: "Add whole numbers up to 1000" };
  after.outcomes = after.outcomes.filter(row => row.id !== "o-mul");
  after.outcomes.push({ id: "o-div", code: "SYN.M.4", title: "Divide whole numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: false });
  const changes = compareVersions(before, after);
  assert.deepEqual(changes.map(change => [change.outcomeId, change.change]).sort(), [["o-add", "CHANGED"], ["o-div", "ADDED"], ["o-mul", "RETIRED"]]);
  const draftOld = paper("draft-old", [["o-add"], ["o-sub"], []], 2), draftUnaffected = paper("draft-sub", [["o-sub"], [], []], 2), released = paper("released", [["o-add"], [], []], 2);
  const impact = versionImpact("cur", changes, 3, [draftOld, draftUnaffected, released], [{ id: "a1", paperId: "released", paperVersion: 1, snapshot: released.data }]);
  assert.deepEqual(impact.affected.map(row => [row.paperId, row.questions]), [["draft-old", ["q1"]]]);
  assert.deepEqual(impact.preserved.map(row => row.paperId), ["released"]);
});
