import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { PERMISSION_MODULES, defaultFlagsForRole, isFixedPermissionRole } from "@/lib/permissions";
import { USER_ROLES } from "@/lib/roles";
import { z } from "zod";
import { assertPermissionAdministration } from "@/lib/auth/permission-administration";
import { assertSameOrigin } from "@/lib/auth/same-origin";

const patchSchema = z.object({ role: z.enum(USER_ROLES), module: z.enum(PERMISSION_MODULES), canView: z.boolean().optional(), canAdd: z.boolean().optional(), canEdit: z.boolean().optional(), canDelete: z.boolean().optional() }).strict();
const privateHeaders = { "Cache-Control": "private, no-store" };
function failure(error: unknown, fallback: string) {
  const response = errorResponse(error, fallback);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

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
    await assertPermissionAdministration(user, "view");

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
      for (const permissionModule of PERMISSION_MODULES) {
        matrix[role][permissionModule] = roleRows.has(permissionModule)
          ? roleRows.get(permissionModule)
          : defaultFlagsForRole(role, permissionModule);
      }
      matrix[role]._fixed = isFixedPermissionRole(role);
    }

    let canEdit = false;
    try { await assertPermissionAdministration(user, "edit"); canEdit = true; }
    catch (error) { if (!(error instanceof Error && "status" in error && error.status === 403)) throw error; }
    return Response.json({ success: true, data: { matrix, modules: PERMISSION_MODULES, callerRole: user.role, canEdit } }, { headers: privateHeaders });
  } catch (error) {
    return failure(error, "[roles/permissions] GET failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await requireAuthUser();
    await assertPermissionAdministration(user, "edit");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("Choose a valid role, module and boolean permissions.", 400);
    const role = parsed.data.role, targetModule = parsed.data.module;
    const { canView, canAdd, canEdit, canDelete } = parsed.data;
    const flags = {
      ...(canView !== undefined ? { canView } : {}), ...(canAdd !== undefined ? { canAdd } : {}),
      ...(canEdit !== undefined ? { canEdit } : {}), ...(canDelete !== undefined ? { canDelete } : {}),
    };
    if (isFixedPermissionRole(role)) throw new ApiError("APP_OWNER / SUPER_ADMIN permissions are fixed", 403);
    if (Object.values(flags).every((v) => v === undefined)) throw new ApiError("No flags provided", 400);
    const updated = await prisma.$transaction(async tx => {
      await assertPermissionAdministration(user, "edit", tx);
      const where = { schoolId_role_module: { schoolId: user.schoolId, role, module: targetModule } };
      const existing = await tx.rolePermission.findUnique({ where });
      const next = { ...defaultFlagsForRole(role, targetModule), ...existing, ...flags };
      if (flags.canView === false) next.canAdd = next.canEdit = next.canDelete = false;
      if (!next.canView && (next.canAdd || next.canEdit || next.canDelete)) throw new ApiError("Enable View before granting another action.", 400);
      const data = { canView: next.canView, canAdd: next.canAdd, canEdit: next.canEdit, canDelete: next.canDelete };
      return tx.rolePermission.upsert({ where, create: { schoolId: user.schoolId, role, module: targetModule, ...data }, update: data });
    });
    return Response.json({ success: true, data: updated }, { headers: privateHeaders });
  } catch (error) {
    return failure(error, "[roles/permissions] PATCH failed");
  }
}
