import type { TxClient } from "@/lib/db/prisma";

/** SKAI-1478: after this many failed deletes a tombstone is FAILED and needs an operator. */
export const MAX_CLEANUP_ATTEMPTS = 8;

type CleanupDb = Pick<TxClient, "storageCleanup">;

/** Call inside the transaction that deletes the metadata, so the key is never lost. */
export function enqueueCleanup(tx: CleanupDb, row: { schoolId: string; campusId: string; objectKey: string; receiptId?: string }) {
  return tx.storageCleanup.upsert({ where: { objectKey: row.objectKey }, create: { ...row, status: "PENDING" }, update: { status: "PENDING", receiptId: row.receiptId ?? null } });
}

/** Tries each PENDING tombstone once. Success marks DONE; failure keeps it PENDING until the attempt cap. */
export async function runCleanups(db: CleanupDb, where: { schoolId: string; receiptId?: string }, remove: (key: string) => Promise<unknown>, limit = 10) {
  const rows = await db.storageCleanup.findMany({ where: { schoolId: where.schoolId, ...(where.receiptId ? { receiptId: where.receiptId } : {}), status: "PENDING" }, orderBy: { createdAt: "asc" }, take: limit });
  const outcome = { done: 0, pending: 0, failed: 0 };
  for (const row of rows) {
    try {
      await remove(row.objectKey);
      await db.storageCleanup.updateMany({ where: { id: row.id, schoolId: row.schoolId }, data: { status: "DONE", attempts: row.attempts + 1, lastError: null, completedAt: new Date() } });
      outcome.done++;
    } catch (error) {
      const attempts = row.attempts + 1;
      const status = attempts >= MAX_CLEANUP_ATTEMPTS ? "FAILED" : "PENDING";
      await db.storageCleanup.updateMany({ where: { id: row.id, schoolId: row.schoolId }, data: { status, attempts, lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500) } });
      outcome[status === "FAILED" ? "failed" : "pending"]++;
    }
  }
  return outcome;
}
