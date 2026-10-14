export const insightKinds = ["ONBOARDING", "SOURCE", "PAPER"] as const;
export type InsightKind = typeof insightKinds[number];
export type ReviewObservation = { kind: InsightKind; createdAt: Date; revisions: { action: string; createdAt: Date }[] };
export function reviewInsights(observations: ReviewObservation[]) {
  return insightKinds.map(kind => {
    const records = observations.filter(row => row.kind === kind);
    const reviewed = records.flatMap(row => {
      const approval = row.revisions.find(revision => revision.action === "APPROVE");
      if (!approval || approval.createdAt < row.createdAt) return [];
      return [{ minutes: (approval.createdAt.getTime() - row.createdAt.getTime()) / 60000, saves: row.revisions.filter(revision => revision.action === "SAVE" && revision.createdAt <= approval.createdAt).length }];
    });
    const sorted = reviewed.map(row => row.minutes).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return { kind, records: records.length, approved: reviewed.length, medianElapsedMinutes: sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null, meanSavesBeforeApproval: reviewed.length ? reviewed.reduce((sum, row) => sum + row.saves, 0) / reviewed.length : null };
  });
}
export type WorkspaceInsights = { generatedAt: string; from: string; days: number; truncated: boolean; maximumRecords: number; reviews: ReturnType<typeof reviewInsights>; documents: { ready: number; failed: number; overdue: number; recovered: number; completed: number } };
