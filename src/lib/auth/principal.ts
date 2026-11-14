import { needsMfaChallenge, requiresMfa } from "./mfa-crypto";
import { AccessDenied } from "./policy";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { normalizeUserRole } from "@/lib/roles";
import type { AuthUser } from "@/lib/auth";
import { resolveInstitutionKind } from "./institution-server";
import { memoForRequest, prefetchedAccount, queryAccount, type AccountRow } from "./request-auth";
import { principalCache, type PrincipalClaims } from "./principal-cache";

/**
 * A signed identity is only a lookup key. Never authorize from stale claims.
 * Served from the principal cache when PRINCIPAL_CACHE=on; every write to the rows it reads invalidates it.
 */
export function resolveCurrentPrincipal(claims: PrincipalClaims): Promise<AuthUser | null> {
  // getAuthUser and the tenant context both resolve the same claims in one request; the memo makes that one read.
  // Memoised per request (request-auth.ts) under one string key; JSON keeps undefined (key absent) apart from null,
  // which the role/version checks below rely on.
  const { userId, schoolId, role, accessVersion, mfaVerified } = claims;
  return resolveMemoised(JSON.stringify({ userId, schoolId, role, accessVersion, mfaVerified }));
}

function resolveMemoised(key: string): Promise<AuthUser | null> {
  const claims = JSON.parse(key) as PrincipalClaims;
  return memoForRequest("principals", key, () => principalCache().resolve(claims, () => loadCurrentPrincipal(claims)));
}

/** The account read: taken from this request's one-round-trip prefetch when getAuthUser made one (request-auth.ts). */
async function readAccount(userId: string, schoolId: string): Promise<AccountRow | null> {
  const prefetched = await prefetchedAccount(userId, schoolId);
  return prefetched !== undefined ? prefetched : queryAccount(userId, schoolId);
}

/**
 * The current-authority decision on an account row, with no I/O: role, access version, the MFA and deferred rules,
 * campus-school mismatch and a deleted school. Shared by the principal path and the proxy's exam boundary (SKAI-1971).
 */
export function accountAuthorityHolds(row: AccountRow | null, claims: PrincipalClaims): boolean {
  if (!row || (claims.role !== undefined && row.role !== normalizeUserRole(claims.role))) return false;
  if (claims.role !== undefined && row.accessVersion !== (claims.accessVersion ?? 0)) return false;
  // A second factor is a property of a signed *session*. Session claims always
  // carry the account's access version, so `getAuthUser`, the tenant guard and
  // `proxy` keep challenging exactly as before, including the requirement that a
  // privileged role has actually enrolled a factor. Identity/ownership probes
  // pass a role without a version (they are not authenticating a browser
  // session); requiring MFA there turned a membership lookup into an MFA gate
  // and denied freshly invited administrators before they could enrol.
  // A privileged role without a factor may defer setup ("Do it later"), which signs
  // a session with mfaVerified "deferred". An enrolled factor is never skippable.
  const deferred = claims.mfaVerified === "deferred" && requiresMfa(row) && !row.mfaEnabled;
  if (claims.role !== undefined && claims.accessVersion !== undefined && !deferred && ((requiresMfa(row) && !row.mfaEnabled) || (needsMfaChallenge(row) && claims.mfaVerified !== true))) return false;
  if (row.campusId && row.campusSchoolId !== null && row.campusSchoolId !== row.schoolId) return false;
  return row.status !== "DELETED";
}

async function loadCurrentPrincipal(claims: PrincipalClaims): Promise<AuthUser | null> {
  const row = await readAccount(claims.userId, claims.schoolId);
  if (!row || !accountAuthorityHolds(row, claims)) return null;
  const account = {
    ...row,
    school: { slug: row.slug, status: row.status, registrationKind: row.registrationKind, institutionSetup: row.institutionType === null ? null : { institutionType: row.institutionType } },
  };
  // GROUP vs STANDALONE (§1.1): registrationKind → setup type → owner role. The owner-role query runs only for
  // schools where both stored signals are unresolved, so ordinary sessions pay for no extra round trip.
  const institutionKind = await resolveInstitutionKind(account.schoolId, account.school);
  return { institutionKind, isInstitutionOwner: account.isInstitutionOwner, canPurchaseSubscription: account.canPurchaseSubscription, canManageMemberships: account.canManageMemberships, accessVersion: account.accessVersion, userId: account.id, schoolId: account.schoolId, campusId: account.campusId,
    role: account.role, email: account.email, fullName: account.fullName,
    onboardingComplete: account.onboardingComplete, schoolSlug: account.school.slug, schoolStatus: account.school.status,
    schoolOperational: { status: account.school.status, subscriptionLifecycleState: account.subscriptionLifecycleState, graceEndsAt: account.graceEndsAt ? new Date(account.graceEndsAt).toISOString() : null } };
}

/** Legacy standalone ADMIN may initialize only the institution it registered. */
export async function assertInitialInstitutionSetup(user: AuthUser) {
  if (!user.isInstitutionOwner || user.onboardingComplete || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) throw new AccessDenied("institution", "setup", user);
  const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { contactEmail: true } });
  if (!school || school.contactEmail.toLowerCase() !== user.email.toLowerCase()) throw new AccessDenied("institution", "setup", user);
}
