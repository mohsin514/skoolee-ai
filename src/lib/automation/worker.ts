import type { generateAIDraft } from "@/lib/ai/openai";
import type { PrismaClient } from "@prisma/client";
import { resolveWorkerPrincipal } from "@/lib/school-ai/access";
import type { AutomaticJob } from "./schema";
import { advanceAutomaticJob } from "./service";

/** A bounded worker pass; actor access is re-resolved before every step. */
export async function sweepAutomaticJobs(db: PrismaClient, limit = 4, generate?: typeof generateAIDraft) {
 const rows = await db.$queryRaw<Array<{ id: string; schoolId: string; actorId: string; actorRole: string; reply: string }>>`
  SELECT id, school_id AS "schoolId", actor_id AS "actorId", actor_role AS "actorRole", reply
  FROM school_ai_requests
  WHERE feature = 'AUTOMATIC_SETUP_V1' AND status = 'PENDING'
   AND reply::jsonb->>'status' = 'RUNNING'
   AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
  ORDER BY updated_at, id LIMIT ${Math.min(10, Math.max(1, limit))}`;
 await Promise.all(rows.map(async row => {
  const job = JSON.parse(row.reply) as AutomaticJob;
  const actor = await resolveWorkerPrincipal({ userId: row.actorId, schoolId: row.schoolId, role: row.actorRole, accessVersion: job.accessVersion }).catch(() => null);
  if (!actor) {
   await db.schoolAiRequest.updateMany({ where: { id: row.id, reply: row.reply, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: new Date() } }] }, data: { reply: JSON.stringify({ ...job, version: job.version + 1, status: "FAILED", error: "Your access changed. Sign in and start a new request." }), status: "FAILED", claimToken: null, leaseExpiresAt: null } });
   return;
  }
  try { await advanceAutomaticJob(actor, row.id, { action: "advance", version: job.version }, generate); }
  catch { /* Another worker/browser can claim the step. Durable state remains authoritative. */ }
 }));
 return { considered: rows.length };
}
