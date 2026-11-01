import { Prisma } from "@prisma/client";
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

  const graceDays = Math.max(0, Math.round(Number(body.graceDays ?? 0)));
  const isActive = body.isActive !== false;
  const payload = { type, value, graceDays, isActive };

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.feeFineRule.create({
        data: { campusId, name, ...payload },
      });
      await writeAuditEvent(tx, user, { table: "fee_fine_rules", recordId: created.id, action: "CREATE", campusId, after: { type, value, graceDays, isActive: created.isActive } });
      return created;
    });
  } catch (error) {
    // SKAI-1621: the unique (campusId, name) index is the arbiter. A concurrent create of the same name
    // loses here and is answered from the committed row: an identical payload replays it, anything else is a 409.
    if (!isUniqueViolation(error)) throw error;
    const committed = await prisma.feeFineRule.findFirst({ where: { campusId, name } });
    if (committed && sameFineRule(committed, payload)) return committed;
    throw new ApiError("A fine rule with this name already exists", 409);
  }
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function sameFineRule(rule: { type: string; value: number; graceDays: number; isActive: boolean }, payload: { type: string; value: number; graceDays: number; isActive: boolean }) {
  return rule.type === payload.type && rule.value === payload.value && rule.graceDays === payload.graceDays && rule.isActive === payload.isActive;
}
