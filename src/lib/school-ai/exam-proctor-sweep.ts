import type { PrismaClient } from "@prisma/client";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { purgeExpiredExamProctor } from "./exam-proctor-service";
/** Service process enumerates tenant references only; each deletion runs inside that tenant. */
export async function sweepExamProctorRecordings(db: PrismaClient, cursor: string | null = null) {
  const now = new Date(), abandonedBefore = new Date(now.getTime() - 300000);
  const rows = await db.$queryRaw<{ school_id: string }[]>`
    SELECT DISTINCT s.school_id FROM school_ai_proctor_sessions s
    WHERE s.school_id > ${cursor ?? ''} AND (
      s.status = 'DELETING' OR (s.status <> 'DELETED' AND s.retention_until <= ${now}) OR
      EXISTS (SELECT 1 FROM school_ai_proctor_clips c WHERE c.session_id = s.id AND c.school_id = s.school_id AND c.status = 'PENDING' AND c.created_at < ${abandonedBefore})
    ) ORDER BY s.school_id LIMIT 11`;
  let deleted = 0, failed = 0;
  for (const { school_id: schoolId } of rows.slice(0, 10)) {
    try { const result = await runWithTenantContext({ schoolId, unscoped: false }, () => purgeExpiredExamProctor(schoolId, 100)); deleted += result.deleted; }
    catch { failed++; }
  }
  return { deleted, failed, cursor: rows.length > 10 ? rows[9].school_id : null };
}
