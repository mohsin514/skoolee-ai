import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { defaultPricingSchema } from "./pricing";

export const DEFAULT_PLAN_PRICES = { FREE: { price: 0 }, BASIC: { price: 4000 }, PRO: { price: 7000 }, ENTERPRISE: { price: null } };
const KEY = "default_plan_pricing";
/** The manual screen and chat use this same atomic, audited operation. */
export async function saveDefaultPlanPrices(user: AuthUser, patch: unknown, opts: { idempotencyKey?: string; expected?: unknown; ipAddress?: string; userAgent?: string } = {}) {
  if (user.role !== "APP_OWNER") throw new ApiError("Platform owner required", 403);
  const parsed = defaultPricingSchema.parse(patch);
  if (!Object.keys(parsed).length) throw new ApiError("Choose at least one package", 400);
  const hash = createHash("sha256").update(JSON.stringify({ operation: KEY, pricing: parsed })).digest("hex");
  return runUnscoped("authorized default plan pricing update", () => prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(842901)`;
    if (opts.idempotencyKey) {
      const previous = await tx.schoolAiRequest.findFirst({ where: { schoolId: user.schoolId, actorId: user.userId, feature: "AUTOMATIC_ACTION_V1", idempotencyKey: opts.idempotencyKey } });
      if (previous) {
        if (previous.requestHash !== hash) throw new ApiError("Request key changed", 409);
        return JSON.parse(previous.reply!) as Record<string, { price?: number | null }>;
      }
    }
    const previous = await tx.platformConfig.findUnique({ where: { key: KEY } });
    const current = (previous?.value ?? DEFAULT_PLAN_PRICES) as Record<string, { price?: number | null }>;
    if (opts.expected !== undefined && !isDeepStrictEqual(current, opts.expected)) throw new ApiError("Prices changed. Review the latest prices before saving.", 409);
    const pricing = { ...current, ...parsed };
    await tx.platformConfig.upsert({ where: { key: KEY }, create: { key: KEY, value: pricing, updatedBy: user.userId }, update: { value: pricing, updatedBy: user.userId } });
    await tx.superAdminAuditLog.create({ data: { userId: user.userId, action: "default_plan_pricing_updated", targetType: "platform_config", targetId: KEY, targetName: "Default plan pricing", oldValues: current as Prisma.InputJsonValue, newValues: pricing, ipAddress: opts.ipAddress, userAgent: opts.userAgent } });
    if (opts.idempotencyKey) await tx.schoolAiRequest.create({ data: { schoolId: user.schoolId, actorId: user.userId, actorRole: user.role, feature: "AUTOMATIC_ACTION_V1", idempotencyKey: opts.idempotencyKey, requestHash: hash, status: "COMPLETED", completedAt: new Date(), reply: JSON.stringify(pricing) } });
    return pricing;
  }));
}
