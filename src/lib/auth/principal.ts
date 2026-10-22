import { needsMfaChallenge, requiresMfa } from "./mfa-crypto";
import { AccessDenied } from "./policy";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { normalizeUserRole } from "@/lib/roles";
import type { AuthUser } from "@/lib/auth";
import { INSTITUTION_KIND_SCHOOL_SELECT, resolveInstitutionKind } from "./institution-server";

/** A signed identity is only a lookup key. Never authorize from stale claims. */
export async function resolveCurrentPrincipal(claims: { userId: string; schoolId: string; role?: unknown; accessVersion?: unknown; mfaVerified?: unknown }): Promise<AuthUser | null> {
  const account = await runUnscoped("authenticate exact signed account and school", () => prisma.user.findFirst({
    where: { id: claims.userId, schoolId: claims.schoolId, isActive: true },
    select: { mfaEnabled: true, isInstitutionOwner: true, canPurchaseSubscription: true, canManageMemberships: true, accessVersion: true, id: true, schoolId: true, campusId: true, role: true, email: true, fullName: true, onboardingComplete: true,
      campus: { select: { schoolId: true } }, school: { select: { slug: true, status: true, ...INSTITUTION_KIND_SCHOOL_SELECT } } },
  }));
  if (!account || (claims.role !== undefined && account.role !== normalizeUserRole(claims.role))) return null;
  if (claims.role !== undefined && account.accessVersion !== (claims.accessVersion ?? 0)) return null;
  // A second factor is a property of a signed *session*. Session claims always
  // carry the account's access version, so `getAuthUser`, the tenant guard and
  // `proxy` keep challenging exactly as before, including the requirement that a
  // privileged role has actually enrolled a factor. Identity/ownership probes
  // pass a role without a version (they are not authenticating a browser
  // session); requiring MFA there turned a membership lookup into an MFA gate
  // and denied freshly invited administrators before they could enrol.
  // A privileged role without a factor may defer setup ("Do it later"), which signs
  // a session with mfaVerified "deferred". An enrolled factor is never skippable.
  const deferred = claims.mfaVerified === "deferred" && requiresMfa(account) && !account.mfaEnabled;
  if (claims.role !== undefined && claims.accessVersion !== undefined && !deferred && ((requiresMfa(account) && !account.mfaEnabled) || (needsMfaChallenge(account) && claims.mfaVerified !== true))) return null;
  if (account.campus && account.campus.schoolId !== account.schoolId) return null;
  if (account.school.status === "DELETED") return null;
  // GROUP vs STANDALONE (§1.1): registrationKind → setup type → owner role. The owner-role query runs only for
  // schools where both stored signals are unresolved, so ordinary sessions pay for no extra round trip.
  const institutionKind = await resolveInstitutionKind(account.schoolId, account.school);
  return { institutionKind, isInstitutionOwner: account.isInstitutionOwner, canPurchaseSubscription: account.canPurchaseSubscription, canManageMemberships: account.canManageMemberships, accessVersion: account.accessVersion, userId: account.id, schoolId: account.schoolId, campusId: account.campusId,
    role: account.role, email: account.email, fullName: account.fullName,
    onboardingComplete: account.onboardingComplete, schoolSlug: account.school.slug, schoolStatus: account.school.status };
}

/** Legacy standalone ADMIN may initialize only the institution it registered. */
export async function assertInitialInstitutionSetup(user: AuthUser) {
  if (!user.isInstitutionOwner || user.onboardingComplete || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) throw new AccessDenied("institution", "setup", user);
  const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { contactEmail: true } });
  if (!school || school.contactEmail.toLowerCase() !== user.email.toLowerCase()) throw new AccessDenied("institution", "setup", user);
}
