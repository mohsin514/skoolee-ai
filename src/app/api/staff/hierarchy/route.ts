import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { buildOrgChart, setStaffPosition } from "@/lib/staff/hierarchy";

// The org chart (Module 8b).
// GET   — nodes, solid and dotted edges, and the unit tree for a campus.
// PATCH — move one person: rank, unit, reporting line, employment state.
//         Every call that changes something writes an appointment record.

const dateish = z.union([z.string(), z.date()]).nullable().optional();

const PositionInput = z.object({
  userId: z.string().uuid(),
  designationId: z.string().uuid().nullable().optional(),
  primaryDepartmentId: z.string().uuid().nullable().optional(),
  reportsToId: z.string().uuid().nullable().optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "VISITING", "ADJUNCT", "CONTRACT", "INTERN", "VOLUNTEER"]).optional(),
  employmentStatus: z
    .enum(["PROBATION", "ACTIVE", "ON_LEAVE", "SECONDED", "SUSPENDED", "NOTICE_PERIOD", "RESIGNED", "RETIRED", "TERMINATED"])
    .optional(),
  employeeCode: z.string().trim().max(40).nullable().optional(),
  basicSalary: z.number().int().min(0).optional(),
  probationEndsAt: dateish,
  contractEndsAt: dateish,
  effectiveFrom: dateish,
  changeKind: z
    .enum([
      "JOINED", "CONFIRMED", "PROMOTION", "DEMOTION", "LATERAL_MOVE", "DEPARTMENT_TRANSFER",
      "CAMPUS_TRANSFER", "REPORTING_CHANGE", "ACTING_ASSIGNMENT", "ACTING_ENDED",
      "CONTRACT_RENEWAL", "SUSPENDED", "REINSTATED", "RESIGNED", "RETIRED", "TERMINATED",
    ])
    .optional(),
  isActing: z.boolean().optional(),
  orderRef: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

function toDate(value: string | Date | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError("Invalid date", 400);
  return date;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "view");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));
    const includeFormer = req.nextUrl.searchParams.get("includeFormer") === "true";

    const [chart, designations, school] = await Promise.all([
      buildOrgChart({ campusId, includeFormer }),
      prisma.staffDesignation.findMany({
        where: { isActive: true },
        select: {
          id: true, name: true, shortName: true, level: true, track: true,
          canHeadDepartment: true, isInstitutionHead: true, promotesToId: true, minYearsInRank: true,
        },
        orderBy: [{ level: "asc" }, { name: "asc" }],
      }),
      prisma.school.findUnique({ where: { id: user.schoolId }, select: { institutionType: true } }),
    ]);

    return Response.json({
      success: true,
      institutionType: school?.institutionType ?? "SCHOOL",
      designations,
      ...chart,
    });
  } catch (error) {
    return errorResponse(error, "[staff/hierarchy] GET failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "edit");
    const input = PositionInput.parse(await req.json());
    const { userId, ...rest } = input;

    // Nobody may move themselves up their own ladder. A campus admin editing
    // their own record can still fix a phone number — this only blocks rank,
    // reporting line and employment state.
    if (userId === user.userId) {
      throw new ApiError("You cannot change your own position in the hierarchy. Ask the school owner.", 403);
    }

    const target = await prisma.user.findFirst({ where: { id: userId }, select: { id: true } });
    if (!target) throw new ApiError("Staff member not found", 404);

    const has = (key: keyof typeof rest) => Object.prototype.hasOwnProperty.call(rest, key);

    const result = await setStaffPosition({
      user,
      userId,
      change: {
        ...(has("designationId") ? { designationId: rest.designationId ?? null } : {}),
        ...(has("primaryDepartmentId") ? { primaryDepartmentId: rest.primaryDepartmentId ?? null } : {}),
        ...(has("reportsToId") ? { reportsToId: rest.reportsToId ?? null } : {}),
        ...(has("employmentType") ? { employmentType: rest.employmentType } : {}),
        ...(has("employmentStatus") ? { employmentStatus: rest.employmentStatus } : {}),
        ...(has("employeeCode") ? { employeeCode: rest.employeeCode ?? null } : {}),
        ...(has("basicSalary") ? { basicSalary: rest.basicSalary } : {}),
        ...(has("probationEndsAt") ? { probationEndsAt: toDate(rest.probationEndsAt) ?? null } : {}),
        ...(has("contractEndsAt") ? { contractEndsAt: toDate(rest.contractEndsAt) ?? null } : {}),
        ...(has("changeKind") ? { changeKind: rest.changeKind } : {}),
        ...(has("isActing") ? { isActing: rest.isActing } : {}),
        ...(has("orderRef") ? { orderRef: rest.orderRef ?? null } : {}),
        ...(has("notes") ? { notes: rest.notes ?? null } : {}),
        effectiveFrom: toDate(rest.effectiveFrom) ?? undefined,
      },
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, "[staff/hierarchy] PATCH failed");
  }
}
