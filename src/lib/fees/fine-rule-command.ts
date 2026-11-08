import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, resolveCampusId } from "@/lib/api/scope";

/**
 * Create a late-payment fine rule (POST /api/fees/fine-rules), extracted so the route and the AI
 * Workflows `fees.create_fine_rule` capability run the same command.
 * Body: { campusId?, name, type: PERCENT|FLAT|PER_DAY, value (percent or paisa), graceDays?, isActive? }.
 * The caller has already checked canManageFinance and fees.add. Throws ApiError with the route's messages.
 */
export async function createFineRule(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "").toUpperCase();

  if (!name) throw new ApiError("name required", 400);
  if (!["PERCENT", "FLAT", "PER_DAY"].includes(type)) throw new ApiError("type must be PERCENT, FLAT or PER_DAY", 400);

  const value = Number(body.value);
  if (!Number.isInteger(value) || value < 0) throw new ApiError("value must be a non-negative integer", 400);
  if (type === "PERCENT" && value > 100) throw new ApiError("percent fine cannot exceed 100", 400);

  // SKAI-1308: a malformed grace period is a validation error, not NaN reaching the database.
  const graceRaw = body.graceDays ?? 0;
  const graceDays = typeof graceRaw === "number" || typeof graceRaw === "string" ? Number(graceRaw) : NaN;
  if (graceRaw === "" || !Number.isInteger(graceDays) || graceDays < 0) throw new ApiError("graceDays must be a non-negative whole number of days", 400);

  const existing = await prisma.feeFineRule.findFirst({ where: { campusId, name } });
  if (existing) throw new ApiError("A fine rule with this name already exists", 409);

  return prisma.$transaction(async (tx) => {
    const created = await tx.feeFineRule.create({
      data: { campusId, name, type, value, graceDays, isActive: body.isActive !== false },
    });
    await writeAuditEvent(tx, user, { table: "fee_fine_rules", recordId: created.id, action: "CREATE", campusId, after: { type, value, graceDays, isActive: created.isActive } });
    return created;
  });
}
