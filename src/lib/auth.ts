// ─────────────────────────────────────────────────────────────────
// Auth helper — decode JWT from cookie
// ─────────────────────────────────────────────────────────────────
import { resolveCurrentPrincipal } from "@/lib/auth/principal";
import { errors as joseErrors, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { normalizeUserRole, type UserRole } from "@/lib/roles";
import type { InstitutionKind } from "@/lib/auth/institution";

import { JWT_SECRET } from "@/lib/auth/secret";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session-cookie";
import { isSessionRevokedStrict } from "@/lib/auth/session-revocation";
import { prefetchAuth } from "@/lib/auth/request-auth";
import { principalCacheEnabled } from "@/lib/auth/principal-cache";
import { isDatabaseUnavailable, ServiceUnavailableError, unavailableReason } from "@/lib/db/availability";
import { ACTIVE_CAMPUS_COOKIE, resolveActiveCampusId } from "@/lib/auth/active-campus";
import { lookupSchoolCampus } from "@/lib/auth/active-campus-server";

export interface AuthUser {
  isInstitutionOwner?: boolean;
  canPurchaseSubscription?: boolean;
  canManageMemberships?: boolean;
  accessVersion?: number;
  mfaVerified?: boolean | "deferred";
  userId: string;
  email: string;
  fullName?: string;
  role: UserRole;
  schoolId: string;
  campusId: string | null;
  schoolSlug?: string;
  schoolStatus?: string;
  onboardingComplete?: boolean;
  /** GROUP or STANDALONE, resolved by resolveCurrentPrincipal (src/lib/auth/institution.ts). Hand-built users
   *  without it fail closed in every authority predicate. */
  institutionKind?: InstitutionKind;
  /** SKAI-1113: SUPER_ADMIN only. A validated campus of this school chosen in the campus switcher; null/absent = "All campuses". */
  activeCampusId?: string | null;
  /** The school row's billing/operational state as read with this principal, so requireAuthUser needs no second
   *  school query. Dates are ISO strings (the principal may come from the JSON cache). */
  schoolOperational?: { status: string; subscriptionLifecycleState: string; graceEndsAt: string | null };
}

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = normalizeUserRole(payload.role);
    const userId = typeof payload.userId === "string" ? payload.userId : null;
    const schoolId = typeof payload.schoolId === "string" ? payload.schoolId : null;

    if (!role || !userId || !schoolId) return null;

    // A valid signature says this server issued the token. It says nothing
    // about whether the session still exists — the cookie is a bearer
    // credential good for 7 or 30 days, so a copy taken before sign-out stayed
    // fully usable for the remainder of that window. Signing out has to mean
    // the token stops working, not merely that one browser forgot it.
    //
    // This lives here rather than in requireAuthUser() alone so that server
    // components and layouts calling getAuthUser() directly are covered too;
    // API routes were never the only way in. The lookup is memoised per
    // request, so the repeated calls a single render makes cost one query.
    const tokenHash = hashSessionToken(token);
    // Scale: session rows and account in one round trip; the checks below read them from this request's store.
    // With the Redis principal cache on, the principal usually comes from Redis, so only the session is read.
    const principal = await engineFailureIsOutage(async () => {
      if (!principalCacheEnabled()) await prefetchAuth(tokenHash, userId, schoolId);
      if (await isSessionRevokedStrict(tokenHash)) return null;
      return resolveCurrentPrincipal({ userId, schoolId, role, accessVersion: payload.accessVersion, mfaVerified: payload.mfaVerified });
    });
    if (!principal) return null;
    const activeCampusId = await resolveActiveCampusId(principal, cookieStore.get(ACTIVE_CAMPUS_COOKIE)?.value, lookupSchoolCampus);
    return { ...principal, ...(activeCampusId ? { activeCampusId } : {}), mfaVerified: payload.mfaVerified === "deferred" ? "deferred" : payload.mfaVerified === true };
  } catch (error) {
    // An unreachable database is an outage, not a sign-out: answering null here made every request 401 and
    // the browser dropped its session (SKAI-1898 load run). Still fail-closed — nothing is authorized.
    if (error instanceof ServiceUnavailableError) throw error;
    if (isDatabaseUnavailable(error)) throw new ServiceUnavailableError(5, undefined, unavailableReason(error));
    // Invalid, expired or tampered tokens are an ordinary sign-out; anything else is worth seeing in the logs.
    // Next's own control-flow errors carry a `digest` and are not failures.
    if (!(error instanceof joseErrors.JOSEError) && !(error && typeof error === "object" && "digest" in error)) {
      console.error("[auth.getAuthUser]", { name: (error as { name?: unknown })?.name, code: (error as { code?: unknown })?.code });
    }
    return null;
  }
}

/** Prisma engine failures that carry no request-level meaning; from the session/principal reads they are an outage. */
const ENGINE_FAILURES = new Set(["PrismaClientUnknownRequestError", "PrismaClientRustPanicError", "PrismaClientInitializationError"]);

/**
 * SKAI-1962: runs the session and principal reads so an engine-level failure there (a statement cancelled by the
 * database, a panicked engine) answers 503 "try again" rather than reading as "signed out". Still fail-closed.
 * Other errors (a tenant-guard violation, a bug) pass through unchanged and keep their fail-closed null.
 */
export async function engineFailureIsOutage<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name;
    if (typeof name === "string" && ENGINE_FAILURES.has(name)) throw new ServiceUnavailableError(5, undefined, unavailableReason(error));
    throw error;
  }
}

