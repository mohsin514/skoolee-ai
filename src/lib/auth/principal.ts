import { AccessDenied } from "./policy";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { normalizeUserRole } from "@/lib/roles";
import type { AuthUser } from "@/lib/auth";

/** A signed identity is only a lookup key. Never authorize from stale claims. */
export async function resolveCurrentPrincipal(claims: { userId: string; schoolId: string; role?: unknown; accessVersion?: unknown }): Promise<AuthUser | null> {
  const account = await runUnscoped("authenticate exact signed account and school", () => prisma.user.findFirst({
    where: { id: claims.userId, schoolId: claims.schoolId, isActive: true },
    select: { isInstitutionOwner: true, canPurchaseSubscription: true, canManageMemberships: true, accessVersion: true, id: true, schoolId: true, campusId: true, role: true, email: true, fullName: true, onboardingComplete: true,
      campus: { select: { schoolId: true } }, school: { select: { slug: true, status: true } } },
  }));
  if (!account || (claims.role !== undefined && account.role !== normalizeUserRole(claims.role))) return null;
  if (claims.role !== undefined && account.accessVersion !== (claims.accessVersion ?? 0)) return null;
  if (account.campus && account.campus.schoolId !== account.schoolId) return null;
  if (account.school.status === "DELETED") return null;
  return { isInstitutionOwner: account.isInstitutionOwner, canPurchaseSubscription: account.canPurchaseSubscription, canManageMemberships: account.canManageMemberships, accessVersion: account.accessVersion, userId: account.id, schoolId: account.schoolId, campusId: account.campusId,
    role: account.role, email: account.email, fullName: account.fullName,
    onboardingComplete: account.onboardingComplete, schoolSlug: account.school.slug, schoolStatus: account.school.status };
}

/** Legacy standalone ADMIN may initialize only the institution it registered. */
export async function assertInitialInstitutionSetup(user: AuthUser) {
  if (!user.isInstitutionOwner || user.onboardingComplete || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) throw new AccessDenied("institution", "setup", user);
  const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { contactEmail: true } });
  if (!school || school.contactEmail.toLowerCase() !== user.email.toLowerCase()) throw new AccessDenied("institution", "setup", user);
}
