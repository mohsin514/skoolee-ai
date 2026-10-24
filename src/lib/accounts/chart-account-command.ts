import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, resolveCampusId } from "@/lib/api/scope";

export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

/**
 * Create a chart-of-accounts entry (POST /api/accounts/chart), extracted so the route and the AI Workflows
 * `accounts.create_account` capability run the same command. Body: { campusId?, name, type }.
 * The caller has already checked canManageFinance and accounts.edit. Throws ApiError with the route's messages.
 */
export async function createChartAccount(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "").toUpperCase();

  if (!name) throw new ApiError("name is required", 400);
  if (!ACCOUNT_TYPES.includes(type)) throw new ApiError(`type must be one of ${ACCOUNT_TYPES.join(", ")}`, 400);

  const existing = await prisma.chartOfAccount.findFirst({ where: { campusId, name } });
  if (existing) throw new ApiError("An account with this name already exists", 409);

  return prisma.$transaction(async (tx) => {
    const created = await tx.chartOfAccount.create({
      data: { campusId, name, type, isSystem: false },
    });
    await writeAuditEvent(tx, user, {
      table: "chart_of_accounts", recordId: created.id, action: "CREATE", campusId: created.campusId,
      after: { type: created.type, isSystem: created.isSystem },
    });
    return created;
  });
}
