import { prisma } from "@/lib/db/prisma";
import { DEFAULT_PERMISSIONS, PERMISSION_MODULES } from "@/lib/permissions";
import type { UserRole } from "@/lib/roles";

export async function seedRolePermissions(schoolId: string) {
  const rows = [];
  const roles = Object.keys(DEFAULT_PERMISSIONS) as UserRole[];
  for (const role of roles) {
    for (const permissionModule of PERMISSION_MODULES) {
      const flags = DEFAULT_PERMISSIONS[role][permissionModule];
      if (!flags.canView && !flags.canAdd && !flags.canEdit && !flags.canDelete) continue;
      rows.push({
        schoolId,
        role,
        module: permissionModule,
        canView: flags.canView,
        canAdd: flags.canAdd,
        canEdit: flags.canEdit,
        canDelete: flags.canDelete,
      });
    }
  }
  if (rows.length) {
    await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
  }
}

