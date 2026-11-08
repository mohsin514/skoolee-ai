import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, resolveCampusId } from "@/lib/api/scope";
import { daysToTenths } from "@/lib/leave";

/**
 * Create a campus leave type (POST /api/leave/types), extracted so the route and the AI Workflows
 * `leave.create_type` capability run the same command. Body: { campusId?, name, defaultDays? }.
 * The caller has already checked canManageCampusOps and the leave.add permission (the route does it before
 * reading the body). Throws ApiError with the route's exact messages and statuses: 400 without a name, 409
 * when the campus already has a type with this exact name.
 */
export async function createLeaveType(user: AuthUser, body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new ApiError("name is required", 400);

  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);

  const existing = await prisma.leaveType.findUnique({
    where: { campusId_name: { campusId, name } },
  });
  if (existing) throw new ApiError(`Leave type "${name}" already exists`, 409);

  return prisma.leaveType.create({
    data: { campusId, name, defaultDays: daysToTenths(Number(body.defaultDays ?? 0)) },
  });
}
