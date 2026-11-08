import type { TxClient } from "@/lib/db/prisma";
import type { PaperData } from "./assessment";
import { bankReuseEligibility, type BankExposureFact } from "./question-bank-exposure";

const HISTORY_LIMIT = 500;
export type BankExposureSource = { paperId: string; campusId: string; paper: PaperData; sourceStatus: string };

/** No learner identities, cohort membership, answer bodies or other-scope records leave this read. */
export async function loadBankExposureFacts(db: TxClient, schoolId: string, source: BankExposureSource, now: Date) {
  const scope = { schoolId, campusId: source.campusId };
  const groups = [...new Set(Object.values(source.paper.itemGroupIds ?? {}))];
  const [exposures, sealed, active] = await Promise.all([
    db.schoolAiExposureEntry.findMany({
      where: { ...scope, OR: [{ paperId: source.paperId }, ...(groups.length ? [{ itemGroupId: { in: groups } }] : [])] },
      select: { paperId: true, questionId: true, itemGroupId: true, examDate: true },
      orderBy: [{ examDate: "desc" }, { id: "desc" }], take: HISTORY_LIMIT + 1,
    }),
    db.schoolAiExamFormRelease.findFirst({
      where: { ...scope, OR: [{ paperId: source.paperId }, ...(source.paper.formSet ? [{ formSetId: source.paper.formSet.id }] : [])] }, select: { id: true },
    }),
    db.schoolAiExamAssignment.findFirst({ where: { ...scope, paperId: source.paperId, status: "ACTIVE", endsAt: { gt: now } }, select: { id: true } }),
  ]);
  return { exposures: exposures.slice(0, HISTORY_LIMIT) as BankExposureFact[], sealedForm: Boolean(sealed), activeExam: Boolean(active), historyLimited: exposures.length > HISTORY_LIMIT };
}

export function bankEligibilityFromFacts(source: BankExposureSource, questionId: string, facts: Awaited<ReturnType<typeof loadBankExposureFacts>>, now: Date) {
  return bankReuseEligibility({
    ...facts, now, sourceArchived: source.sourceStatus === "ARCHIVED",
    identity: { paperId: source.paperId, questionId, explicitItemGroupId: source.paper.itemGroupIds?.[questionId] },
  });
}
