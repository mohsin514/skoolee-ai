import { setTimeout as delay } from "node:timers/promises";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";

/**
 * PostgreSQL may abort a serializable transaction even when concurrent writes
 * target different records. Retry only that rollback condition. Callbacks must
 * contain database operations only; provider calls happen before this boundary.
 * Each attempt rereads idempotency and version predicates from a fresh snapshot.
 */
export async function schoolAiTransaction<T>(user: AuthUser, work: (tx: TxClient) => Promise<T>): Promise<T> {
  return retryDatabaseTransaction(() => runWithTenantContext({ schoolId: user.schoolId, userId: user.userId, campusId: user.campusId, role: user.role, unscoped: false, rlsSession: true }, () => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_school_id', ${user.schoolId}, true)`;
    return work(tx as TxClient);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 })));
}

/** Retry the entire rolled-back transaction, never just its failed statement. */
export async function retryDatabaseTransaction<T>(work: () => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry++) {
    try {
      return await work();
    } catch (error) {
      const rolledBackForConcurrency = error instanceof Prisma.PrismaClientKnownRequestError && (
        error.code === "P2034" ||
        // Raw row locks expose the same PostgreSQL rollback via P2010 rather
        // than P2034. Do not retry unrelated raw-query or application errors.
        error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code))
      );
      if (!rolledBackForConcurrency || retry >= 6) throw error;
      // Serializable predicate conflicts can involve unrelated tenant inserts.
      // Give those short transactions room to finish without retrying in
      // lockstep: seven attempts, each delay bounded below one second.
      const backoff = Math.min(1000, 40 * 2 ** retry);
      await delay(backoff / 2 + Math.floor(Math.random() * backoff / 2));
    }
  }
}
