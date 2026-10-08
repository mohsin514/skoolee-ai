import { randomUUID } from "node:crypto";
import { cancel, type Sql, type Reference } from "./outbox";

export async function requireWorkflowOperator(tx: Sql, userId: string, sessionSchoolId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id=${userId} AND school_id=${sessionSchoolId}
    AND role='APP_OWNER' AND is_active=true FOR SHARE`;
  if (!rows.length) throw new Error("OPERATOR_REQUIRED");
}

export async function operateWorkflow(tx: Sql, ref: Reference, userId: string, action: "retry" | "cancel") {
  const rows = await tx.$queryRaw<{ state: string; checkpoint: number }[]>`SELECT state,checkpoint FROM workflow_jobs WHERE id=${ref.eventId} AND school_id=${ref.schoolId} FOR UPDATE`;
  if (!rows.length) throw new Error("WORKFLOW_NOT_FOUND");
  if (action === "retry") {
    if (rows[0].state !== "failed") throw new Error("FAILED_WORKFLOW_REQUIRED");
    const uncertain = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM workflow_effects WHERE job_id=${ref.eventId} AND school_id=${ref.schoolId} AND state='uncertain' LIMIT 1`;
    if (uncertain.length) throw new Error("RECONCILE_EXTERNAL_OUTCOME_FIRST");
    await tx.$executeRaw`UPDATE workflow_jobs SET state='queued', max_attempts=attempts+5, reason='OPERATOR_RETRY', finished_at=NULL,
      next_attempt_at=now(), updated_at=now() WHERE id=${ref.eventId} AND school_id=${ref.schoolId}`;
    await tx.$executeRaw`UPDATE workflow_events SET available_at=now(),lease_token=NULL,lease_until=NULL WHERE id=${ref.eventId} AND school_id=${ref.schoolId}`;
  } else {
    if (["completed", "cancelled"].includes(rows[0].state)) throw new Error("WORKFLOW_ALREADY_TERMINAL");
    await cancel(tx, ref);
  }
  await tx.$executeRaw`INSERT INTO audit_logs (id,school_id,table_name,record_id,user_id,new_value)
    VALUES (${randomUUID()},${ref.schoolId},'workflow_jobs',${ref.eventId},${userId},
      ${JSON.stringify({ action, checkpoint: rows[0].checkpoint, priorState: rows[0].state })}::jsonb)`;
  return { action, checkpoint: rows[0].checkpoint, message: action === "retry" ? "Retry scheduled from the confirmed checkpoint; completion is pending." : "Cancellation requested at the next safe boundary. Confirmed and uncertain external effects remain recorded." };
}
