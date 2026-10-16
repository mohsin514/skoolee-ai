import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { prisma } from "@/lib/db/prisma";
import { assertPermission } from "@/lib/permissions";
import { AccessDenied } from "./policy";

/** Module delegation never grants the ability to change the delegation matrix. */
export async function assertPermissionAdministration(user: AuthUser, action: "view" | "edit", db: Pick<TxClient, "rolePermission"> = prisma) {
  if (!["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"].includes(user.role)) throw new AccessDenied("permission-matrix", action, user);
  // RolePermission is institution-wide, not a campus override. A campus title
  // or membership-invitation delegation must never confer school-wide writes.
  if (action === "edit" && user.role !== "SUPER_ADMIN" && user.isInstitutionOwner !== true) throw new AccessDenied("permission-matrix", action, user);
  await assertPermission(user, "staff", action, db);
}
