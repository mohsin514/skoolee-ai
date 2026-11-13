import { needsMfaChallenge, requiresMfa } from "./mfa-crypto";
import { AccessDenied } from "./policy";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { normalizeUserRole } from "@/lib/roles";
import type { AuthUser } from "@/lib/auth";
import { resolveInstitutionKind } from "./institution-server";
import { cache } from "react";
import { principalCache, type PrincipalClaims } from "./principal-cache";

/**
 * A signed identity is only a lookup key. Never authorize from stale claims.
 * Served from the principal cache when PRINCIPAL_CACHE=on; every write to the rows it reads invalidates it.
 */
export function resolveCurrentPrincipal(claims: PrincipalClaims): Promise<AuthUser | null> {
  // getAuthUser and the tenant context both resolve the same claims in one request; the memo makes that one read.
  // React's cache compares arguments by identity, so the claims travel as one string; JSON keeps undefined (key
  // absent) apart from null, which the role/version checks below rely on.
  const { userId, schoolId, role, accessVersion, mfaVerified } = claims;
  return resolveMemoised(JSON.stringify({ userId, schoolId, role, accessVersion, mfaVerified }));
}

const resolveMemoised = cache((key: string) => {
  const claims = JSON.parse(key) as PrincipalClaims;
  return principalCache().resolve(claims, () => loadCurrentPrincipal(claims));
});

type AccountRow = {
  id: string; schoolId: string; campusId: string | null; role: string; email: string; fullName: string; onboardingComplete: boolean;
  mfaEnabled: boolean; isInstitutionOwner: boolean; canPurchaseSubscription: boolean; canManageMemberships: boolean; accessVersion: number;
  campusSchoolId: string | null; slug: string; status: string; registrationKind: string | null; institutionType: string | null;
};

/**
 * The account, its campus's school, its school and the institution setup in ONE round trip. The relation select
 * this replaces ran four queries (users, campuses, schools, institution_setups) on every authenticated request.
 */
async function readAccount(userId: string, schoolId: string): Promise<AccountRow | null> {
  const rows = await runUnscoped("authenticate exact signed account and school", () => prisma.$queryRaw<AccountRow[]>`
    SELECT u.id, u.school_id AS "schoolId", u.campus_id AS "campusId", u.role::text AS role, u.email, u.full_name AS "fullName",
           u.onboarding_complete AS "onboardingComplete", u.mfa_enabled AS "mfaEnabled", u.is_institution_owner AS "isInstitutionOwner",
           u.can_purchase_subscription AS "canPurchaseSubscription", u.can_manage_memberships AS "canManageMemberships",
           u.access_version AS "accessVersion", c.school_id AS "campusSchoolId", s.slug, s.status,
           s.registration_kind AS "registrationKind", isu.institution_type AS "institutionType"
    FROM users u
    JOIN schools s ON s.id = u.school_id
    LEFT JOIN campuses c ON c.id = u.campus_id
    LEFT JOIN institution_setups isu ON isu.school_id = u.school_id
    WHERE u.id = ${userId} AND u.school_id = ${schoolId} AND u.is_active = true
    LIMIT 1`);
  const row = rows[0];
  return row ? { ...row, accessVersion: Number(row.accessVersion) } : null;
}

async function loadCurrentPrincipal(claims: PrincipalClaims): Promise<AuthUser | null> {
  const row = await readAccount(claims.userId, claims.schoolId);
  const account = row && {
    ...row,
    campus: row.campusId && row.campusSchoolId !== null ? { schoolId: row.campusSchoolId } : null,
    school: { slug: row.slug, status: row.status, registrationKind: row.registrationKind, institutionSetup: row.institutionType === null ? null : { institutionType: row.institutionType } },
  };
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
