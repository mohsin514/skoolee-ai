import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { assertPermission } from "@/lib/permissions";
import { isCampusOperator, isInstitutionAuthority } from "./institution";
import { AccessDenied } from "./policy";

export const PERMISSION_EDIT_MFA_MESSAGE = "Turn on two-step sign-in before you change role permissions.";

/**
 * What the caller may do with the role permission matrix (§7.3 G18), without throwing. RolePermission is
 * institution-wide, not a campus override, so only the institution authority edits it — and only with a verified
 * second factor. Campus operators may read it to see what their staff can do. A principal, a campus title or a
 * membership delegation never confers either. `mfaRequired` lets the F28 pre-check tell "this is not yours"
 * apart from "turn on two-step sign-in first".
 */
export function permissionAdministrationAccess(user: Pick<AuthUser, "role" | "institutionKind" | "isInstitutionOwner" | "mfaVerified">) {
  const authority = isInstitutionAuthority(user);
  return {
    view: authority || isCampusOperator(user),
    edit: authority && user.mfaVerified === true,
    mfaRequired: authority && user.mfaVerified !== true,
  };
}

export async function assertPermissionAdministration(user: AuthUser, action: "view" | "edit", db: Pick<TxClient, "rolePermission"> = prisma) {
  const access = permissionAdministrationAccess(user);
  if (!access.view) throw new AccessDenied("permission-matrix", action, user);
  if (action === "edit" && !access.edit) {
    // The authority without a verified factor gets the actionable refusal (403 + MFA_REQUIRED); anyone else the generic one.
    if (access.mfaRequired) throw new ApiError(PERMISSION_EDIT_MFA_MESSAGE, 403, "MFA_REQUIRED");
    throw new AccessDenied("permission-matrix", action, user);
  }
  await assertPermission(user, "staff", action, db);
}
