import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { assertApprovalRole, assertSchoolAiAccess, assertWorkspaceDomainPermission, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, SchoolAiError } from "./access";
import { schoolAiTransaction } from "./transaction";
import { insightKinds, reviewInsights, type InsightKind, type ReviewObservation, type WorkspaceInsights } from "./insights";
export async function getWorkspaceInsights(user: AuthUser, rawCampus: string, days = 30): Promise<WorkspaceInsights> {
  const campus = z.string().min(1).max(128).parse(rawCampus); z.number().int().min(1).max(90).parse(days);
  return schoolAiTransaction(user, async db => {
    assertApprovalRole(user);
    const account = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, role: user.role, isActive: true, accessVersion: user.accessVersion ?? 0 }, select: { id: true } });
    if (!account) throw new SchoolAiError("Your school access changed.", 403);
    const permissions = await loadWorkspacePermissionSnapshot(user, db); await assertSchoolAiAccess(user, "view", permissions);
    const campusId = await resolveWorkspaceCampus(user, campus, db), now = new Date(), from = new Date(now.getTime() - days * 86400000);
    const rows = await db.schoolAiRecord.findMany({ where: { schoolId: user.schoolId, campusId, kind: { in: [...insightKinds] }, createdAt: { gte: from, lte: now } }, select: { id: true, kind: true, data: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 101 });
    const allowed: ReviewObservation[] = [], sourceIds: string[] = []; let truncated = rows.length > 100;
    for (const row of rows.slice(0, 100)) {
      try { await assertWorkspaceDomainPermission(user, row.kind as InsightKind, row.data as Record<string, unknown>, "view", permissions); }
      catch (error) { if (error instanceof Error && "status" in error && error.status === 403) continue; throw error; }
      const revisions = await db.schoolAiRevision.findMany({ where: { schoolId: user.schoolId, campusId, recordId: row.id }, select: { action: true, createdAt: true, data: true }, orderBy: { version: "asc" }, take: 101 });
      if (revisions.length > 100) { truncated = true; continue; }
      // Reclassified sources must not reveal restricted historical review activity.
      let readable = true;
      for (const revision of revisions) { try { await assertWorkspaceDomainPermission(user, row.kind as InsightKind, revision.data as Record<string, unknown>, "view", permissions); } catch (error) { if (error instanceof Error && "status" in error && error.status === 403) { readable = false; break; } throw error; } }
      if (!readable) continue;
      allowed.push({ kind: row.kind as InsightKind, createdAt: row.createdAt, revisions }); if (row.kind === "SOURCE") sourceIds.push(row.id);
    }
    const base = { schoolId: user.schoolId, campusId, recordId: { in: sourceIds }, createdAt: { gte: from, lte: now } };
    const [ready, failed, overdue, recovered, completed] = await Promise.all([
      db.schoolAiDocumentJob.count({ where: { ...base, status: "READY" } }), db.schoolAiDocumentJob.count({ where: { ...base, status: "FAILED" } }),
      db.schoolAiDocumentJob.count({ where: { ...base, status: { in: ["QUEUED", "PROCESSING"] }, scheduledAt: { lt: new Date(now.getTime() - 300000) } } }),
      db.schoolAiDocumentJob.count({ where: { ...base, status: { in: ["APPLIED", "COMPLETED"] }, attempts: { gt: 1 } } }), db.schoolAiDocumentJob.count({ where: { ...base, status: { in: ["APPLIED", "COMPLETED"] } } }),
    ]);
    return { generatedAt: now.toISOString(), from: from.toISOString(), days, truncated, maximumRecords: 100, reviews: reviewInsights(allowed), documents: { ready, failed, overdue, recovered, completed } };
  });
}
