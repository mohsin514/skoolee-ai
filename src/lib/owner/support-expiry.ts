import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/queue/outbox";

/**
 * Worker-side expiry sweep. It runs without a browser request so grants and
 * their queued actions are stopped even when the owner has closed the page.
 * Selects a small locked batch, then records every automatic expiry atomically.
 */
export async function expireSupportGrants(db: Database, limit = 100): Promise<number> {
  return db.$transaction(async (tx) => {
    const expired = await tx.$queryRaw<{ id: string; schoolId: string; actorId: string }[]>`
      WITH due AS (
        SELECT id FROM support_grants
        WHERE status IN ('pending', 'approved', 'active') AND expires_at <= now()
        ORDER BY expires_at LIMIT ${Math.min(Math.max(limit, 1), 500)}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE support_grants grant_row SET status='expired'
      FROM due WHERE grant_row.id=due.id
      RETURNING grant_row.id, grant_row.school_id AS "schoolId", grant_row.requested_by_id AS "actorId"
    `;
    if (!expired.length) return 0;
    const ids = expired.map((row) => row.id);
    await tx.$executeRaw`UPDATE support_actions SET status='cancelled', completed_at=now()
      WHERE grant_id = ANY(${ids}::text[]) AND status='queued'`;
    await tx.$executeRaw`UPDATE workflow_jobs SET cancel_requested_at=now()
      WHERE support_grant_id = ANY(${ids}::text[]) AND state='queued'`;
    for (const grant of expired) {
      await tx.$executeRaw`INSERT INTO super_admin_audit_logs
        (id, user_id, action, target_type, target_id, new_values, status, created_at)
        VALUES (${randomUUID()}, NULL, 'support_access_expired', 'support_grant', ${grant.id},
          ${JSON.stringify({ schoolId: grant.schoolId, supportActorId: grant.actorId, source: "expiry_worker" })}::jsonb,
          'success', now())`;
    }
    return expired.length;
  });
}
