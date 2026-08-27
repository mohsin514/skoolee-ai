import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { applyInstitutionPreset } from "@/lib/staff/hierarchy";
import { INSTITUTION_PRESETS, isInstitutionType } from "@/lib/staff/hierarchy-presets";

// The rank ladder (Module 8b).
// GET    — every designation for the school, most senior first, with headcount.
// POST   — create one, or `{ preset: "UNIVERSITY" }` to seed a whole ladder.
// PATCH  — rename / re-level / re-wire a rank.
// DELETE — retire a rank. Refused while staff still hold it.

const TrackEnum = z.enum(["LEADERSHIP", "ACADEMIC", "ADMINISTRATIVE", "SUPPORT"]);

const DesignationInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  shortName: z.string().trim().max(24).optional().nullable(),
  level: z.number().int().min(1).max(999),
  track: TrackEnum.default("ACADEMIC"),
  canHeadDepartment: z.boolean().default(false),
  isInstitutionHead: z.boolean().default(false),
  promotesToId: z.string().uuid().optional().nullable(),
  minYearsInRank: z.number().int().min(0).max(50).optional().nullable(),
  description: z.string().trim().max(400).optional().nullable(),
});

export async function GET() {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "view");

    const [designations, school] = await Promise.all([
      prisma.staffDesignation.findMany({
        select: {
          id: true,
          name: true,
          shortName: true,
          level: true,
          track: true,
          canHeadDepartment: true,
          isInstitutionHead: true,
          promotesToId: true,
          minYearsInRank: true,
          description: true,
          isActive: true,
          _count: { select: { staffProfiles: true } },
        },
        orderBy: [{ level: "asc" }, { name: "asc" }],
      }),
      prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { institutionType: true },
      }),
    ]);

    return Response.json({
      success: true,
      institutionType: school?.institutionType ?? "SCHOOL",
      presets: Object.values(INSTITUTION_PRESETS).map((p) => ({
        type: p.type,
        label: p.label,
        blurb: p.blurb,
        rankCount: p.designations.length,
        departmentCount: p.departments.length,
      })),
      designations: designations.map(({ _count, ...d }) => ({ ...d, staffCount: _count.staffProfiles })),
    });
  } catch (error) {
    return errorResponse(error, "[staff/designations] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "add");
    const body = await req.json();

    // Seeding a whole ladder from a preset.
    if (body.preset !== undefined) {
      if (!isInstitutionType(body.preset)) throw new ApiError("Unknown institution type", 400);
      const campusId = await resolveCampusId(user, body.campusId ?? null);
      const result = await applyInstitutionPreset({ user, campusId, type: body.preset });
      return Response.json({ success: true, ...result }, { status: 201 });
    }

    const input = DesignationInput.parse(body);
    await assertHeadIsUnique(user.schoolId, input.isInstitutionHead, null);

    const created = await prisma.staffDesignation.create({
      data: {
        name: input.name,
        shortName: input.shortName || null,
        level: input.level,
        track: input.track,
        canHeadDepartment: input.canHeadDepartment,
        isInstitutionHead: input.isInstitutionHead,
        promotesToId: input.promotesToId || null,
        minYearsInRank: input.minYearsInRank ?? null,
        description: input.description || null,
      },
    });

    return Response.json({ success: true, designation: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[staff/designations] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "edit");
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) throw new ApiError("id is required", 400);

    const existing = await prisma.staffDesignation.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new ApiError("Designation not found", 404);

    const input = DesignationInput.partial().parse(body);
    if (input.promotesToId === id) throw new ApiError("A rank cannot promote into itself", 400);
    if (input.isInstitutionHead) await assertHeadIsUnique(user.schoolId, true, id);

    const updated = await prisma.staffDesignation.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.shortName === undefined ? {} : { shortName: input.shortName || null }),
        ...(input.level === undefined ? {} : { level: input.level }),
        ...(input.track === undefined ? {} : { track: input.track }),
        ...(input.canHeadDepartment === undefined ? {} : { canHeadDepartment: input.canHeadDepartment }),
        ...(input.isInstitutionHead === undefined ? {} : { isInstitutionHead: input.isInstitutionHead }),
        ...(input.promotesToId === undefined ? {} : { promotesToId: input.promotesToId || null }),
        ...(input.minYearsInRank === undefined ? {} : { minYearsInRank: input.minYearsInRank ?? null }),
        ...(input.description === undefined ? {} : { description: input.description || null }),
        ...(body.isActive === undefined ? {} : { isActive: Boolean(body.isActive) }),
      },
    });

    // The level is cached on every profile that holds this rank so the chart can
    // sort without loading the ladder — re-levelling has to carry through.
    if (input.level !== undefined || input.name !== undefined) {
      await prisma.staffProfile.updateMany({
        where: { designationId: id },
        data: {
          ...(input.level === undefined ? {} : { seniorityLevel: input.level }),
          ...(input.name === undefined ? {} : { designation: input.name }),
        },
      });
    }

    return Response.json({ success: true, designation: updated });
  } catch (error) {
    return errorResponse(error, "[staff/designations] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "delete");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const designation = await prisma.staffDesignation.findFirst({
      where: { id },
      select: { id: true, name: true, _count: { select: { staffProfiles: true } } },
    });
    if (!designation) throw new ApiError("Designation not found", 404);

    // Deleting out from under the people who hold the rank would blank their
    // position and orphan their history. Retiring it keeps both intact and
    // simply stops it being offered for new appointments.
    if (designation._count.staffProfiles > 0) {
      await prisma.staffDesignation.update({ where: { id }, data: { isActive: false } });
      return Response.json({
        success: true,
        retired: true,
        message: `${designation.name} is held by ${designation._count.staffProfiles} staff, so it has been retired rather than deleted. It will no longer be offered for new appointments.`,
      });
    }

    await prisma.staffDesignation.delete({ where: { id } });
    return Response.json({ success: true, retired: false });
  } catch (error) {
    return errorResponse(error, "[staff/designations] DELETE failed");
  }
}

/** At most one rank may be the root of the chart. */
async function assertHeadIsUnique(schoolId: string, wantsHead: boolean, selfId: string | null) {
  if (!wantsHead) return;
  const clash = await prisma.staffDesignation.findFirst({
    where: { isInstitutionHead: true, isActive: true, ...(selfId ? { id: { not: selfId } } : {}) },
    select: { name: true },
  });
  if (clash) {
    throw new ApiError(
      `"${clash.name}" is already the head of the institution. Clear that first — the chart can only have one root.`,
      409
    );
  }
}
