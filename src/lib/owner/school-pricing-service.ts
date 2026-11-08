import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { schoolPricingSchema } from "./pricing";

type Pricing = Record<string, { price?: number | null }>;
const NO_EXPECTED = Symbol("no-expected");

/**
 * SKAI-1794 / SKAI-1795: a platform owner saves one school's plan price overrides.
 * - Per-plan merge: a plan in the patch with a price is set; a plan sent as {} (no price) is cleared;
 *   plans not in the patch are kept (saving only PRO no longer wipes BASIC).
 * - Compare-and-set: `expected` is the overrides the caller loaded; under a row lock, a mismatch → 409 and nothing
 *   is written, so two concurrent saves from the same starting point cannot silently overwrite each other.
 * Currency, effective date and ledger model are unchanged (single PKR price per plan).
 */
export async function saveSchoolPlanPrices(user: AuthUser, schoolId: string, patch: unknown, opts: { expected?: unknown } = {}) {
  if (user.role !== "APP_OWNER") throw new ApiError("Platform owner required", 403);
  const parsed = schoolPricingSchema.safeParse(patch);
  if (!parsed.success) throw new ApiError("Provide valid plan prices: each price must be a finite non-negative number", 400);
  const expected = "expected" in opts ? opts.expected : NO_EXPECTED;
  return runUnscoped("authorized per-school plan pricing update", () => prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string; name: string; plan_pricing: Pricing | null }[]>`SELECT id, name, plan_pricing FROM schools WHERE id = ${schoolId} FOR UPDATE`;
    const school = rows[0];
    if (!school) throw new ApiError("School not found", 404);
    const current: Pricing = school.plan_pricing && typeof school.plan_pricing === "object" ? school.plan_pricing : {};
    if (expected !== NO_EXPECTED && !isDeepStrictEqual(current, expected ?? {})) throw new ApiError("This school's prices changed. Review the latest prices before saving.", 409);
    const next: Pricing = { ...current };
    for (const [plan, value] of Object.entries(parsed.data)) {
      if (typeof value?.price === "number") next[plan] = { price: value.price };
      else delete next[plan];
    }
    await tx.school.update({ where: { id: school.id }, data: { planPricing: next as Prisma.InputJsonValue } });
    await tx.superAdminAuditLog.create({ data: { userId: user.userId, action: "plan_pricing_updated", targetType: "school", targetId: school.id, targetName: school.name, oldValues: current as Prisma.InputJsonValue, newValues: { pricing: next } as Prisma.InputJsonValue } });
    return next;
  }));
}
