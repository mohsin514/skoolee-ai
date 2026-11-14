import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, resolveCampusId } from "@/lib/api/scope";
import { daysToTenths } from "@/lib/leave";
import { isLeaveTypeNameClash, leaveTypeNameTaken, parseLeaveTypeDefaultDays } from "@/lib/leave/type-input";

/**
 * Create a campus leave type (POST /api/leave/types), extracted so the route and the AI Workflows
 * `leave.create_type` capability run the same command. Body: { campusId?, name, defaultDays? }.
 * The caller has already checked canManageCampusOps and the leave.add permission (the route does it before
 * reading the body). Throws ApiError with the route's exact messages and statuses: 400 without a name or with a
 * non-numeric or negative defaultDays, 409 when the campus already has a type with this exact name (including
 * a concurrent identical create that loses the unique-key race).
 */
export async function createLeaveType(user: AuthUser, body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new ApiError("name is required", 400);
  const defaultDays = parseLeaveTypeDefaultDays(body.defaultDays);

  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);

  const existing = await prisma.leaveType.findUnique({
    where: { campusId_name: { campusId, name } },
  });
  if (existing) throw leaveTypeNameTaken(name);

  try {
    return await prisma.leaveType.create({
      data: { campusId, name, defaultDays: daysToTenths(defaultDays) },
    });
  } catch (error) {
    if (isLeaveTypeNameClash(error)) throw leaveTypeNameTaken(name);
    throw error;
  }
}
