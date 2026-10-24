import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, resolveCampusId } from "@/lib/api/scope";

/**
 * Create a payment method reference (POST /api/accounts/payment-methods), extracted so the route and the AI
 * Workflows `accounts.create_payment_method` capability run the same command. Body: { campusId?, name, isActive? }.
 * The caller has already checked canManageFinance and accounts.add. Throws ApiError with the route's messages.
 */
export async function createPaymentMethod(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const name = String(body.name ?? "").trim();
  if (!name) throw new ApiError("name is required", 400);

  const existing = await prisma.paymentMethodRef.findFirst({ where: { campusId, name } });
  if (existing) throw new ApiError("A payment method with this name already exists", 409);

  return prisma.$transaction(async (tx) => {
    const created = await tx.paymentMethodRef.create({
      data: { campusId, name, isActive: body.isActive !== false },
    });
    await writeAuditEvent(tx, user, {
      table: "payment_method_refs", recordId: created.id, action: "CREATE", campusId: created.campusId,
      after: { isActive: created.isActive },
    });
    return created;
  });
}
