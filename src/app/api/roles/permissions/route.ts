import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { PERMISSION_MODULES, defaultFlagsForRole, isFixedPermissionRole } from "@/lib/permissions";
import { USER_ROLES } from "@/lib/roles";

// GET /api/roles/permissions
// Returns the full matrix for the caller's school: modules × roles with
// effective flags (stored override or defaults). Fixed roles (APP_OWNER,
// SUPER_ADMIN) always show full access.
//
// PATCH /api/roles/permissions
// body: { role, module, canView?, canAdd?, canEdit?, canDelete? }
// Upserts a single cell of the matrix. Fixed roles are rejected.

export async function GET() {
  try {
    const user = await requireAuthUser();

    const rows = await prisma.rolePermission.findMany({
      where: { schoolId: user.schoolId },
      select: { role: true, module: true, canView: true, canAdd: true, canEdit: true, canDelete: true },
    });

    const byRole = new Map<string, Map<string, { canView: boolean; canAdd: boolean; canEdit: boolean; canDelete: boolean }>>();
    for (const row of rows) {
      if (!byRole.has(row.role)) byRole.set(row.role, new Map());
      byRole.get(row.role)!.set(row.module, {
        canView: row.canView,
        canAdd: row.canAdd,
        canEdit: row.canEdit,
        canDelete: row.canDelete,
      });
    }

    const matrix: Record<string, any> = {};
    for (const role of USER_ROLES) {
      const roleRows = byRole.get(role) ?? new Map();
      matrix[role] = {};
      for (const module of PERMISSION_MODULES) {
        matrix[role][module] = roleRows.has(module)
          ? roleRows.get(module)
          : defaultFlagsForRole(role, module);
      }
      matrix[role]._fixed = isFixedPermissionRole(role);
    }

    return Response.json({ success: true, data: { matrix, modules: PERMISSION_MODULES, callerRole: user.role } });
  } catch (error) {
    return errorResponse(error, "[roles/permissions] GET failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await req.json();

    const role = String(body.role ?? "").toUpperCase();
    const module = String(body.module ?? "");
    if (!USER_ROLES.includes(role as any)) throw new ApiError("Invalid role", 400);
    if (!PERMISSION_MODULES.includes(module as any)) throw new ApiError("Invalid module", 400);
    if (isFixedPermissionRole(role)) throw new ApiError("APP_OWNER / SUPER_ADMIN permissions are fixed", 403);

    const flags = {
      canView: body.canView === undefined ? undefined : Boolean(body.canView),
      canAdd: body.canAdd === undefined ? undefined : Boolean(body.canAdd),
      canEdit: body.canEdit === undefined ? undefined : Boolean(body.canEdit),
      canDelete: body.canDelete === undefined ? undefined : Boolean(body.canDelete),
    };
    if (Object.values(flags).every((v) => v === undefined)) throw new ApiError("No flags provided", 400);

    const updated = await prisma.rolePermission.upsert({
      where: { schoolId_role_module: { schoolId: user.schoolId, role: role as any, module } },
      create: {
        schoolId: user.schoolId,
        role: role as any,
        module,
        canView: flags.canView ?? false,
        canAdd: flags.canAdd ?? false,
        canEdit: flags.canEdit ?? false,
        canDelete: flags.canDelete ?? false,
      },
      update: {
        ...(flags.canView !== undefined ? { canView: flags.canView } : {}),
        ...(flags.canAdd !== undefined ? { canAdd: flags.canAdd } : {}),
        ...(flags.canEdit !== undefined ? { canEdit: flags.canEdit } : {}),
        ...(flags.canDelete !== undefined ? { canDelete: flags.canDelete } : {}),
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[roles/permissions] PATCH failed");
  }
}
