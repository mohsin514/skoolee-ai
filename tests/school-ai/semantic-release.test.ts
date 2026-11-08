import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import type { TxClient } from "../../src/lib/db/prisma";
import { assertSolverAllowsRelease, currentSolverFindings, savedSolverFindings } from "../../src/lib/school-ai/semantic-release";
import { sealRelease } from "../../src/lib/school-ai/exam-release-service";
import { type SemanticReview } from "../../src/lib/school-ai/learning";
import { examReleaseCopy } from "../../src/components/school-ai/exam-release-copy";
import { assessmentFixture } from "./assessment-fixture";
import { redis } from "../../src/lib/queue/connection";

redis.disconnect();
const { paper } = assessmentFixture();
const review = (ids: string[], consistent = false): SemanticReview => ({ findings: [], checks: ids.map(questionId => ({ questionId, consistent, independentAnswer: "Four", reason: "The saved answer disagrees with the independent solution." })) });

test("a persisted independent disagreement blocks only under the blocking policy", () => {
  const evidence = [{ paper, review: review(["q1"]) }];
  const blocking = currentSolverFindings(paper, evidence, "BLOCK_DISAGREEMENT");
  assert.equal(blocking[0].severity, "BLOCKING");
  assert.throws(() => assertSolverAllowsRelease(blocking), { code: "SOLVER_DISAGREEMENT", status: 409 });
  assert.doesNotThrow(() => assertSolverAllowsRelease(blocking, "q2"));
  const advisory = currentSolverFindings(paper, evidence, "ADVISORY");
  assert.equal(advisory[0].severity, "ADVISORY");
  assert.doesNotThrow(() => assertSolverAllowsRelease(advisory));
  assert.deepEqual(currentSolverFindings(paper, [], "BLOCK_DISAGREEMENT"), [], "manual papers do not require an AI call");
});

test("approval metadata and unrelated item edits cannot erase a current disagreement", () => {
  const updated = structuredClone(paper);
  updated.questions[0].review = { state: "APPROVED", itemRevision: 1, invalidated: [], history: [] };
  updated.questions[0].locked = true;
  updated.questions[1].prompt = "A different question";
  assert.equal(currentSolverFindings(updated, [{ paper, review: review(["q1"]) }], "BLOCK_DISAGREEMENT")[0].severity, "BLOCKING");
});

test("a human correction changes the evidence: stale findings cannot block the repaired item", () => {
  const repaired = structuredClone(paper);
  repaired.questions[0].correctOptionId = "a2";
  assert.deepEqual(currentSolverFindings(repaired, [{ paper, review: review(["q1"]) }], "BLOCK_DISAGREEMENT"), []);
  assert.equal(currentSolverFindings(paper, [{ paper, review: review(["q1"]) }], "BLOCK_DISAGREEMENT").length, 1, "reverting the fix restores the finding");
});

test("a newer partial recheck resolves only its own item and preserves other findings", () => {
  const results = currentSolverFindings(paper, [
    { paper, review: review(["q1"], true) }, { paper, review: review(["q1", "q2"]) },
  ], "BLOCK_DISAGREEMENT");
  assert.deepEqual(results.map(row => row.questionIds), [["q2"]]);
});

test("consistent answers with warnings stay advisory; explicit blockers still block", () => {
  const checked = review(["q1"], true);
  checked.findings = [{ questionId: "q1", category: "LANGUAGE", severity: "WARNING", explanation: "Clarify the wording.", quote: paper.questions[0].prompt }];
  assert.equal(currentSolverFindings(paper, [{ paper, review: checked }], "BLOCK_DISAGREEMENT")[0].severity, "ADVISORY");
  checked.findings[0].severity = "BLOCKER";
  assert.equal(currentSolverFindings(paper, [{ paper, review: checked }], "BLOCK_DISAGREEMENT")[0].severity, "BLOCKING");
});

test("saved findings are school/campus/paper scoped, across reviewers and exact immutable evidence", async () => {
  const db = {
    aIUsageLog: { findMany: async (query: { where: Record<string, unknown> }) => {
      assert.deepEqual(query.where, { schoolId: "school", campusId: "campus", feature: "SCHOOL_AI_PAPER_SEMANTICS", metadata: { path: ["recordId"], equals: "paper" } });
      return [{ output: review(["q1"]), metadata: { recordVersion: 2 } }];
    } },
    schoolAiRevision: { findMany: async (query: { where: Record<string, unknown> }) => {
      assert.deepEqual(query.where, { schoolId: "school", campusId: "campus", recordId: "paper", version: { in: [2] } });
      return [{ version: 2, data: paper }];
    } },
  } as unknown as TxClient;
  assert.equal((await savedSolverFindings(db, { schoolId: "school" }, { id: "paper", version: 3, campusId: "campus" }, paper, "BLOCK_DISAGREEMENT"))[0].severity, "BLOCKING");
});

test("the legacy assignment seal cannot bypass a current solver disagreement", async () => {
  const user = { schoolId: "school" } as AuthUser;
  const db = {
    schoolAiRevision: { findFirst: async () => null },
    aIUsageLog: { findMany: async () => [{ output: review(["q1"]), metadata: { recordVersion: 1 } }] },
  } as unknown as TxClient;
  await assert.rejects(() => sealRelease(db, user, { id: "paper", version: 1, campusId: "campus", createdById: "author" }, paper), { status: 409, code: "SOLVER_DISAGREEMENT" });
});

test("solver findings, checks and repair guidance are localized in all supported languages", () => {
  for (const locale of ["en", "ar", "ur"] as const) {
    const copy = examReleaseCopy(locale);
    assert.ok(copy.solverTitle && copy.solverRepair && copy.blockerText.SOLVER_DISAGREEMENT && copy.checks.SOLVER_DISAGREEMENT);
    if (locale !== "en") assert.notEqual(copy.solverRepair, examReleaseCopy("en").solverRepair);
  }
});
