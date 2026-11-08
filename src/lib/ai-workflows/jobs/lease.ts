import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * One worker or request advances a job at a time. A lease is a compare-and-set on (lease free or
 * expired); it lasts at least twice the 40 s unit deadline (control P10) and is renewed by heartbeat.
 */
export const UNIT_DEADLINE_MS = 40_000;
export const LEASE_MS = 2 * UNIT_DEADLINE_MS + 10_000;

export interface Lease { jobId: string; schoolId: string; token: string }

export async function claimLease(jobId: string, schoolId: string, owner: string, now = new Date()): Promise<Lease | null> {
  const token = randomUUID();
  const claimed = await prisma.aiWorkflowJob.updateMany({
    where: { id: jobId, schoolId, OR: [{ leaseToken: null }, { leaseExpiresAt: { lte: now } }] },
    data: { leaseToken: token, leaseOwner: owner, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
  });
  return claimed.count === 1 ? { jobId, schoolId, token } : null;
}

export async function renewLease(lease: Lease, now = new Date()) {
  const renewed = await prisma.aiWorkflowJob.updateMany({ where: { id: lease.jobId, schoolId: lease.schoolId, leaseToken: lease.token }, data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS) } });
  return renewed.count === 1;
}

export async function releaseLease(lease: Lease) {
  await prisma.aiWorkflowJob.updateMany({ where: { id: lease.jobId, schoolId: lease.schoolId, leaseToken: lease.token }, data: { leaseToken: null, leaseOwner: null, leaseExpiresAt: null } });
}

/** Runs `work` under the lease with a deadline signal; the lease is always released. */
export async function withLease<T>(jobId: string, schoolId: string, owner: string, work: (lease: Lease, signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const lease = await claimLease(jobId, schoolId, owner);
  if (!lease) return null;
  const signal = AbortSignal.timeout(UNIT_DEADLINE_MS);
  try { return await work(lease, signal); }
  finally { await releaseLease(lease); }
}
