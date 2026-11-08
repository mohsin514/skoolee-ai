import type { AuthUser } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { getLocalePackage } from "@/lib/locale/store";
import { ApiError, resolveCampusId } from "@/lib/api/scope";

/** The route's code normalisation: trimmed, upper case, spaces as underscores ("sibling 10" → "SIBLING_10"). */
export const discountCode = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");

/**
 * Create a named discount (POST /api/fees/discounts), extracted so the route and the AI Workflows
 * `fees.create_discount` capability run the same command.
 * Body: { campusId?, name, code, type: PERCENT|FLAT, value (percent 0-100 or paisa), categoryId?, currency? }.
 * The caller has already checked canManageFinance and fees.add. Throws ApiError with the route's messages.
 */
/** The fields a person chose; an existing row with the same ones is the same discount. */
export function sameDiscount(row: { name: string; type: string; value: number; categoryId: string | null }, input: { name: string; type: string; value: number; categoryId: string | null }) {
  return row.name === input.name && row.type === input.type && row.value === input.value && (row.categoryId ?? null) === (input.categoryId ?? null);
}

export async function createDiscount(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const name = String(body.name ?? "").trim();
  const code = discountCode(body.code);
  const type = String(body.type ?? "").toUpperCase();

  if (!name || !code) throw new ApiError("name and code required", 400);
  if (type !== "PERCENT" && type !== "FLAT") throw new ApiError("type must be PERCENT or FLAT", 400);

  const value = Number(body.value);
  if (!Number.isInteger(value) || value < 0) throw new ApiError("value must be a non-negative integer", 400);
  if (type === "PERCENT" && value > 100) throw new ApiError("percent discount cannot exceed 100", 400);

  if (body.categoryId) {
    const category = await prisma.studentCategory.findFirst({ where: { id: String(body.categoryId), campusId } });
    if (!category) throw new ApiError("Category not found", 404);
  }

  const categoryId = (body.categoryId as string | null | undefined) ?? null;
  // SKAI-1611: an identical create (double click, two admins, a retried AI step) replays the stored discount;
  // a different discount under the same code is a 409. A lost race is handled the same way, never a raw P2002.
  const settle = async () => {
    const existing = await prisma.feeDiscount.findUnique({ where: { campusId_code: { campusId, code } }, include: { category: { select: { id: true, name: true } } } });
    if (!existing) return null;
    if (sameDiscount(existing, { name, type, value, categoryId })) return existing;
    throw new ApiError("A discount with this code already exists", 409);
  };
  const replay = await settle();
  if (replay) return replay;

  const currency = (await getLocalePackage(user.schoolId, campusId)).currency;
  if ((body.currency || "PKR") !== currency) throw new ApiError("Currency changed. Reload discount form.", 409);
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.feeDiscount.create({
        data: { campusId, currency, name, code, type, value, categoryId },
        include: { category: { select: { id: true, name: true } } },
      });
      await writeAuditEvent(tx, user, { table: "fee_discounts", recordId: created.id, action: "CREATE", campusId, after: { type, value, currency, categoryId: created.categoryId } });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await settle();
      if (winner) return winner;
    }
    throw error;
  }
}
