import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { setDepartmentHead, setDepartmentMembership } from "@/lib/staff/hierarchy";

// Departments, faculties and sections (Module 8b).
// GET    — the unit tree for a campus with heads and member lists.
// POST   — create a unit, or `{ action: "set-head" | "set-member" }`.
// PATCH  — rename / re-parent / re-kind a unit.
// DELETE — remove a unit. Refused while it still has children or members.

const KindEnum = z.enum(["FACULTY", "SCHOOL", "DEPARTMENT", "SECTION", "ADMIN_UNIT"]);
const RoleEnum = z.enum(["HEAD", "DEPUTY_HEAD", "COORDINATOR", "MEMBER"]);

const DepartmentInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  code: z.string().trim().max(16).optional().nullable(),
  kind: KindEnum.default("DEPARTMENT"),
  parentId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(400).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "view");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const departments = await prisma.department.findMany({
      where: { campusId },
      select: {
        id: true,
        name: true,
        code: true,
        kind: true,
        parentId: true,
        headId: true,
        description: true,
        isActive: true,
        sortOrder: true,
        head: { select: { id: true, fullName: true, profileImageUrl: true } },
        members: {
          where: { endedAt: null },
          select: {
            id: true,
            role: true,
            isPrimary: true,
            isActing: true,
            user: {
              select: {
                id: true,
                fullName: true,
                profileImageUrl: true,
                staffProfile: { select: { designation: true, seniorityLevel: true } },
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return Response.json({
      success: true,
      departments: departments.map((d) => ({
        ...d,
        members: [...d.members].sort((a, b) => {
          const rank = { HEAD: 0, DEPUTY_HEAD: 1, COORDINATOR: 2, MEMBER: 3 };
          const byRole = rank[a.role] - rank[b.role];
          if (byRole !== 0) return byRole;
          return (a.user.staffProfile?.seniorityLevel ?? 999) - (b.user.staffProfile?.seniorityLevel ?? 999);
        }),
      })),
    });
  } catch (error) {
    return errorResponse(error, "[staff/departments] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    const body = await req.json();

    if (body.action === "set-head") {
      await assertPermission(user, "staff", "edit");
      const departmentId = String(body.departmentId ?? "");
      if (!departmentId) throw new ApiError("departmentId is required", 400);
      const result = await setDepartmentHead({
        user,
        departmentId,
        userId: body.userId ? String(body.userId) : null,
        isActing: Boolean(body.isActing),
      });
      return Response.json({ success: true, ...result });
    }

    if (body.action === "set-member") {
      await assertPermission(user, "staff", "edit");
      const departmentId = String(body.departmentId ?? "");
      const userId = String(body.userId ?? "");
      if (!departmentId || !userId) throw new ApiError("departmentId and userId are required", 400);
      const role = RoleEnum.parse(body.role ?? "MEMBER");
      const result = await setDepartmentMembership({
        user,
        departmentId,
        userId,
        role,
        isPrimary: body.isPrimary === undefined ? undefined : Boolean(body.isPrimary),
      });
      return Response.json({ success: true, member: result });
    }

    if (body.action === "remove-member") {
      await assertPermission(user, "staff", "edit");
      const memberId = String(body.memberId ?? "");
      if (!memberId) throw new ApiError("memberId is required", 400);
      const member = await prisma.departmentMember.findFirst({
        where: { id: memberId },
        select: { id: true, userId: true, role: true, departmentId: true },
      });
      if (!member) throw new ApiError("Membership not found", 404);
      // Closed, not deleted: "who headed Science in 2024" has to stay answerable.
      await prisma.departmentMember.update({ where: { id: memberId }, data: { endedAt: new Date() } });
      if (member.role === "HEAD") {
        await prisma.department.updateMany({ where: { id: member.departmentId }, data: { headId: null } });
      }
      await prisma.staffProfile.updateMany({
        where: { userId: member.userId, primaryDepartmentId: member.departmentId },
        data: { primaryDepartmentId: null },
      });
      return Response.json({ success: true });
    }

    await assertPermission(user, "staff", "add");
    const campusId = await resolveCampusId(user, body.campusId ?? null);
    const input = DepartmentInput.parse(body);
    await assertParentIsSameCampus(input.parentId, campusId);

    const created = await prisma.department.create({
      data: {
        campusId,
        name: input.name,
        code: input.code || null,
        kind: input.kind,
        parentId: input.parentId || null,
        description: input.description || null,
      },
    });

    return Response.json({ success: true, department: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[staff/departments] POST failed");
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

    const existing = await prisma.department.findFirst({ where: { id }, select: { id: true, campusId: true } });
    if (!existing) throw new ApiError("Department not found", 404);

    const input = DepartmentInput.partial().parse(body);

    if (input.parentId !== undefined && input.parentId) {
      if (input.parentId === id) throw new ApiError("A unit cannot sit inside itself", 400);
      await assertParentIsSameCampus(input.parentId, existing.campusId);
      await assertNoUnitCycle(id, input.parentId);
    }

    const updated = await prisma.department.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.code === undefined ? {} : { code: input.code || null }),
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.parentId === undefined ? {} : { parentId: input.parentId || null }),
        ...(input.description === undefined ? {} : { description: input.description || null }),
        ...(body.isActive === undefined ? {} : { isActive: Boolean(body.isActive) }),
        ...(body.sortOrder === undefined ? {} : { sortOrder: Number(body.sortOrder) || 0 }),
      },
    });

    return Response.json({ success: true, department: updated });
  } catch (error) {
    return errorResponse(error, "[staff/departments] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "delete");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const department = await prisma.department.findFirst({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { children: true, members: { where: { endedAt: null } } } },
      },
    });
    if (!department) throw new ApiError("Department not found", 404);

    if (department._count.children > 0) {
      throw new ApiError(
        `${department.name} still has ${department._count.children} unit(s) inside it. Move or remove those first.`,
        409
      );
    }

    if (department._count.members > 0) {
      await prisma.department.update({ where: { id }, data: { isActive: false } });
      return Response.json({
        success: true,
        retired: true,
        message: `${department.name} still has ${department._count.members} member(s), so it has been archived rather than deleted.`,
      });
    }

    await prisma.department.delete({ where: { id } });
    return Response.json({ success: true, retired: false });
  } catch (error) {
    return errorResponse(error, "[staff/departments] DELETE failed");
  }
}

async function assertParentIsSameCampus(parentId: string | null | undefined, campusId: string) {
  if (!parentId) return;
  const parent = await prisma.department.findFirst({ where: { id: parentId }, select: { campusId: true } });
  if (!parent) throw new ApiError("The parent unit does not exist", 400);
  if (parent.campusId !== campusId) throw new ApiError("The parent unit belongs to a different campus", 400);
}

/** Re-parenting a faculty under one of its own departments would make the tree
 *  unwalkable, so the same loop check the reporting chain gets applies here. */
async function assertNoUnitCycle(id: string, parentId: string) {
  let cursor: string | null = parentId;
  for (let depth = 0; depth < 32 && cursor; depth += 1) {
    if (cursor === id) throw new ApiError("That would put the unit inside one of its own sub-units", 400);
    const parent: { parentId: string | null } | null = await prisma.department.findFirst({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
}
