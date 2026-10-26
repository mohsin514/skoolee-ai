import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { paperDataSchema, type PaperData, type Question } from "./assessment";
import { examChainPolicy, type ExamChainPolicy } from "./exam-authority";
import { semanticReviewSchema, validateSemanticReview, type SemanticReview } from "./learning";
import { canonicalDigest } from "./canonical";

type SolverPolicy = ExamChainPolicy["solverFindings"];
export type SolverFinding = {
  check: "SOLVER_DISAGREEMENT";
  severity: "BLOCKING" | "ADVISORY";
  questionIds: string[];
  detail: string;
};
export type SemanticEvidence = { review: SemanticReview; paper: PaperData };

/** Review/status metadata never changes what the solver checked; keys, rubrics and references do. */
function itemFingerprint(paper: PaperData, question: Question) {
  const { review: _review, locked: _locked, reusedFrom: _origin, ...content } = question;
  return canonicalDigest({
    question: content, curriculumId: paper.curriculumId, curriculumVersion: paper.curriculumVersion,
    resources: paper.resources?.filter(resource => resource.approved) ?? [],
  });
}

/** Newest first, per item: a partial re-check must not erase another item's disagreement. */
export function currentSolverFindings(paper: PaperData, evidence: readonly SemanticEvidence[], policy: SolverPolicy): SolverFinding[] {
  const current = new Map(paper.questions.map(question => [question.id, itemFingerprint(paper, question)]));
  const checked = new Set<string>();
  const findings: SolverFinding[] = [];
  for (const entry of evidence) for (const check of entry.review.checks) {
    const question = entry.paper.questions.find(item => item.id === check.questionId);
    if (checked.has(check.questionId) || !question || current.get(question.id) !== itemFingerprint(entry.paper, question)) continue;
    checked.add(question.id);
    const observations = entry.review.findings.filter(finding => finding.questionId === question.id);
    if (check.consistent && !observations.length) continue;
    const disagreement = !check.consistent || observations.some(finding => finding.severity === "BLOCKER");
    findings.push({ check: "SOLVER_DISAGREEMENT", severity: policy === "BLOCK_DISAGREEMENT" && disagreement ? "BLOCKING" : "ADVISORY",
      questionIds: [question.id], detail: [!check.consistent ? check.reason : "", ...observations.map(finding => finding.explanation)].filter(Boolean).join(" ").slice(0, 3000) });
  }
  return findings;
}

/** Saved reviews from any authorized reviewer apply to their exact content, including across approval-only revisions. */
export async function savedSolverFindings(tx: TxClient, user: Pick<AuthUser, "schoolId">, record: { id: string; version: number; campusId: string | null }, paper: PaperData, policy: SolverPolicy): Promise<SolverFinding[]> {
  const rows = await tx.aIUsageLog.findMany({
    where: { schoolId: user.schoolId, campusId: record.campusId, feature: "SCHOOL_AI_PAPER_SEMANTICS", metadata: { path: ["recordId"], equals: record.id } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { output: true, metadata: true },
  });
  const versionOf = (metadata: unknown) => {
    const version = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>).recordVersion : undefined;
    return typeof version === "number" && Number.isSafeInteger(version) && version > 0 && version <= record.version ? version : null;
  };
  const versions = [...new Set(rows.flatMap(row => { const version = versionOf(row.metadata); return version !== null && version !== record.version ? [version] : []; }))];
  const revisions = versions.length ? await tx.schoolAiRevision.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId, recordId: record.id, version: { in: versions } }, select: { version: true, data: true } }) : [];
  const papers = new Map<number, PaperData>([[record.version, paper]]);
  for (const revision of revisions) { const parsed = paperDataSchema.safeParse(revision.data); if (parsed.success) papers.set(revision.version, parsed.data); }
  const evidence: SemanticEvidence[] = [];
  for (const row of rows) {
    const version = versionOf(row.metadata), reviewedPaper = version === null ? undefined : papers.get(version);
    if (!reviewedPaper) continue;
    const review = semanticReviewSchema.safeParse(row.output);
    if (!review.success) throw new ApiError("A saved independent review cannot be read. Review the paper again before approval or release.", 409, "SOLVER_EVIDENCE_INVALID");
    try { validateSemanticReview(review.data, reviewedPaper, review.data.checks.map(check => check.questionId)); }
    catch { throw new ApiError("A saved independent review no longer matches its evidence. Review the paper again.", 409, "SOLVER_EVIDENCE_INVALID"); }
    evidence.push({ paper: reviewedPaper, review: review.data });
  }
  return currentSolverFindings(paper, evidence, policy);
}

export async function paperSolverFindings(tx: TxClient, user: AuthUser, record: { id: string; version: number; campusId: string | null }, paper: PaperData) {
  // Repository approval calls this same gate; defer its import to avoid a module initialization cycle.
  const { resolveScopeDeliveryPolicy } = await import("./repository");
  const policy = examChainPolicy((await resolveScopeDeliveryPolicy(user, record.campusId, tx)).policy);
  return savedSolverFindings(tx, user, record, paper, policy.solverFindings);
}

export function assertSolverAllowsRelease(findings: readonly SolverFinding[], questionId?: string) {
  const blocked = findings.filter(finding => finding.severity === "BLOCKING" && (!questionId || finding.questionIds.includes(questionId)));
  if (blocked.length) throw new ApiError("The independent review found an unresolved disagreement. Correct the affected item in Create & review, recheck it and complete its review before approval or release.", 409, "SOLVER_DISAGREEMENT");
}
