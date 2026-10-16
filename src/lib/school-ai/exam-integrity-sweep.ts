import type { PrismaClient } from "@prisma/client";
import { purgeExpiredExamIntegrity } from "./exam-integrity-service";

/** Service process enumerates tenant IDs only; deletion rebinds each tenant. */
export async function sweepExamIntegrity(db: PrismaClient, cursor: string | null = null, now = new Date()) {
  const rows = await db.$queryRaw<Array<{ school_id: string }>>`
    SELECT school_id FROM (
      SELECT school_id FROM school_ai_exam_integrity_events WHERE retention_until <= ${now}
      UNION SELECT school_id FROM audit_logs WHERE table_name = 'school_ai_exam_integrity_events' AND retention_until <= ${now}
    ) expired WHERE school_id > ${cursor ?? ""} ORDER BY school_id LIMIT 11`;
  let deletedEvents = 0, deletedAuditCopies = 0, failed = 0;
  for (const { school_id: schoolId } of rows.slice(0, 10)) {
    try {
      const result = await purgeExpiredExamIntegrity(schoolId, 200, now);
      deletedEvents += result.deletedEvents; deletedAuditCopies += result.deletedAuditCopies;
    } catch { failed++; }
  }
  return { deletedEvents, deletedAuditCopies, failed, cursor: rows.length > 10 ? rows[9].school_id : null };
}
