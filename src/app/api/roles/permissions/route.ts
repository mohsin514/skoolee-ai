import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { PERMISSION_MODULES, isFixedPermissionRole, moduleFlags } from "@/lib/permissions";
import { kindFor } from "@/lib/auth/institution";
import { USER_ROLES } from "@/lib/roles";
import { z } from "zod";
import { assertPermissionAdministration, permissionAdministrationAccess } from "@/lib/auth/permission-administration";
import { assertSameOrigin } from "@/lib/auth/same-origin";

// reason: optional (the panel asks for one on a whole-group/whole-module change or a role copy); when not empty, 10–500
// characters. It is kept in the audit row so the history says why a school-wide permission change was made.
const patchSchema = z.object({ role: z.enum(USER_ROLES), module: z.enum(PERMISSION_MODULES), canView: z.boolean().optional(), canAdd: z.boolean().optional(), canEdit: z.boolean().optional(), canDelete: z.boolean().optional(), reason: z.string().trim().max(500).optional() }).strict();
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
// body: { role, module, canView?, canAdd?, canEdit?, canDelete?, reason? }
// Upserts a single cell of the matrix. Fixed roles are rejected. `reason` lands in the audit row.

export async function GET() {
  try {
    const user = await requireAuthUser();
    await assertPermissionAdministration(user, "view");

    const rows = await prisma.rolePermission.findMany({
      where: { schoolId: user.schoolId },
      // updatedAt lets moduleFlags apply the role-defaults cut-over (§7.4): a stored copy of the old default shows the new one.
      select: { role: true, module: true, canView: true, canAdd: true, canEdit: true, canDelete: true, updatedAt: true },
    });

    const matrix: Record<string, any> = {};
    for (const role of USER_ROLES) {
      const roleRows = rows.filter((row) => row.role === role);
      matrix[role] = {};
      for (const permissionModule of PERMISSION_MODULES) matrix[role][permissionModule] = moduleFlags(roleRows, role, permissionModule);
      matrix[role]._fixed = isFixedPermissionRole(role);
      // Nobody edits their own role row (no self-lockout, no self-grant).
      matrix[role]._own = role === user.role;
    }

    let canEdit = false;
    try { await assertPermissionAdministration(user, "edit"); canEdit = true; }
    catch (error) { if (!(error instanceof Error && "status" in error && error.status === 403)) throw error; }
    // F28 pre-check: the authority without a verified second factor sees "Turn on two-step sign-in" instead of a
    // read-only matrix that does not say why (PATCH answers 403 { code: "MFA_REQUIRED" } in that case).
    const { mfaRequired } = permissionAdministrationAccess(user);
    return Response.json({ success: true, data: { matrix, modules: PERMISSION_MODULES, callerRole: user.role, canEdit, mfaRequired } }, { headers: privateHeaders });
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
    const reason = parsed.data.reason || undefined;
    if (reason && reason.length < 10) throw new ApiError("Add a reason of at least 10 characters.", 400);
    const flags = {
      ...(canView !== undefined ? { canView } : {}), ...(canAdd !== undefined ? { canAdd } : {}),
      ...(canEdit !== undefined ? { canEdit } : {}), ...(canDelete !== undefined ? { canDelete } : {}),
    };
    if (isFixedPermissionRole(role)) throw new ApiError("The platform operator and group admin permissions are fixed.", 403);
    // G18: no one edits their own role row, so an authority cannot lock themselves out (or widen their own access).
    if (role === user.role) throw new ApiError("Your own role's permissions are managed for you and cannot be changed here.", 403);
    if (Object.values(flags).every((v) => v === undefined)) throw new ApiError("No flags provided", 400);
    const updated = await prisma.$transaction(async tx => {
      await assertPermissionAdministration(user, "edit", tx);
      const where = { schoolId_role_module: { schoolId: user.schoolId, role, module: targetModule } };
      const existing = await tx.rolePermission.findUnique({ where });
      // Start from the effective flags (cut-over aware), so toggling one action never re-saves an old default.
      const next = { ...moduleFlags(existing ? [existing] : [], role, targetModule), ...flags };
      if (flags.canView === false) next.canAdd = next.canEdit = next.canDelete = false;
      if (!next.canView && (next.canAdd || next.canEdit || next.canDelete)) throw new ApiError("Enable View before granting another action.", 400);
      // A single school's admin must always be able to see its staff (the school would be unmanageable).
      if (role === "ADMIN" && targetModule === "staff" && !next.canView && kindFor(user) === "STANDALONE") throw new ApiError("The school admin always keeps Staff view.", 400);
      const data = { canView: next.canView, canAdd: next.canAdd, canEdit: next.canEdit, canDelete: next.canDelete };
      const saved = await tx.rolePermission.upsert({ where, create: { schoolId: user.schoolId, role, module: targetModule, ...data }, update: data });
      await writeAuditEvent(tx, user, {
        table: "role_permissions", recordId: saved.id, action: existing ? "UPDATE" : "CREATE",
        ...(existing ? { before: { role, module: targetModule, canView: existing.canView, canAdd: existing.canAdd, canEdit: existing.canEdit, canDelete: existing.canDelete } } : {}),
        after: { role, module: targetModule, ...data, ...(reason ? { reason } : {}) },
      });
      return saved;
    });
    return Response.json({ success: true, data: updated }, { headers: privateHeaders });
  } catch (error) {
    return failure(error, "[roles/permissions] PATCH failed");
  }
}
