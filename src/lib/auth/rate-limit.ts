import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
/** Atomic shared fixed-window counters. Database failure denies the operation. */
export async function authRateLimit(scope: string, { limit = 10, windowMs = 300_000 } = {}) {
  const bucket = Math.floor(Date.now() / windowMs);
  const key = createHash("sha256").update(`${scope}:${bucket}`).digest("hex");
  const row = await prisma.authAttempt.upsert({ where: { key }, create: { key, expiresAt: new Date((bucket + 1) * windowMs) }, update: { count: { increment: 1 } }, select: { count: true } });
  // Opportunistic bounded-frequency pruning; counters expire independently of cleanup.
  if (row.count === 1 && Math.random() < 0.01) await prisma.authAttempt.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } } });
  return { ok: row.count <= limit, remaining: Math.max(0, limit - row.count) };
}
