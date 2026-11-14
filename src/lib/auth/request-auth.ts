// ─────────────────────────────────────────────────────────────────
// Scale: one database round trip for a signed-in request.
//
// Every authenticated request checked the session row (revocation) and then
// read the account (principal) — two round trips, the floor of every API call.
// `prefetchAuth` reads both in ONE query and keeps the results for the rest of
// this request only (React `cache` scopes the store per request). The revocation
// check and the principal read take the prefetched values when they are there
// and query exactly as before when they are not (jobs, other callers, or when
// the Redis principal cache is on). The decisions made on the rows are unchanged.
// ─────────────────────────────────────────────────────────────────
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import type { UserRole } from "@/lib/roles";

export type AccountRow = {
  id: string; schoolId: string; campusId: string | null; role: UserRole; email: string; fullName: string; onboardingComplete: boolean;
  mfaEnabled: boolean; isInstitutionOwner: boolean; canPurchaseSubscription: boolean; canManageMemberships: boolean; accessVersion: number;
  campusSchoolId: string | null; slug: string; status: string; registrationKind: string | null; institutionType: string | null;
  subscriptionLifecycleState: string; graceEndsAt: Date | null;
};
export type SessionActivity = { isActive: boolean };

type Store = { sessions: Map<string, Promise<SessionActivity[]>>; accounts: Map<string, AccountRow | null>; principals: Map<string, Promise<unknown>>; prefetches: Map<string, Promise<void>> };

/**
 * Per-request store, keyed by the request's cookie object (one object per request in production, in pages and route
 * handlers alike; React's cache does not scope route handlers). Outside a request (jobs) there is no store and every
 * lookup queries as before.
 */
const stores = new WeakMap<object, Store>();
async function requestStore(): Promise<Store | null> {
  try {
    const jar = (await cookies()) as unknown as object;
    let s = stores.get(jar);
    if (!s) { s = { sessions: new Map(), accounts: new Map(), principals: new Map(), prefetches: new Map() }; stores.set(jar, s); }
    return s;
  } catch {
    return null;
  }
}

/** Memoise `compute` for the rest of this request; a failure is not remembered. */
export async function memoForRequest<T>(bucket: "principals", key: string, compute: () => Promise<T>): Promise<T> {
  const s = await requestStore();
  if (!s) return compute();
  const hit = s[bucket].get(key);
  if (hit) return hit as Promise<T>;
  const value = compute();
  s[bucket].set(key, value);
  value.catch(() => s[bucket].delete(key));
  return value;
}

/** This request's session rows for a token: prefetched, memoised, or read by `lookup`. */
export async function sessionRowsForRequest(tokenHash: string, lookup: (tokenHash: string) => Promise<SessionActivity[]>): Promise<SessionActivity[]> {
  const s = await requestStore();
  if (!s) return lookup(tokenHash);
  const hit = s.sessions.get(tokenHash);
  if (hit) return hit;
  const value = lookup(tokenHash);
  s.sessions.set(tokenHash, value);
  value.catch(() => s.sessions.delete(tokenHash));
  return value;
}
const accountKey = (userId: string, schoolId: string) => `${userId}\u0000${schoolId}`;

function normalise(row: AccountRow): AccountRow {
  return { ...row, accessVersion: Number(row.accessVersion) };
}

/** The account, its campus's school, its school and the institution setup in one query (SKAI-1913). */
export async function queryAccount(userId: string, schoolId: string): Promise<AccountRow | null> {
  const rows = await runUnscoped("authenticate exact signed account and school", () => prisma.$queryRaw<AccountRow[]>`
    SELECT u.id, u.school_id AS "schoolId", u.campus_id AS "campusId", u.role::text AS role, u.email, u.full_name AS "fullName",
           u.onboarding_complete AS "onboardingComplete", u.mfa_enabled AS "mfaEnabled", u.is_institution_owner AS "isInstitutionOwner",
           u.can_purchase_subscription AS "canPurchaseSubscription", u.can_manage_memberships AS "canManageMemberships",
           u.access_version AS "accessVersion", c.school_id AS "campusSchoolId", s.slug, s.status,
           s.registration_kind AS "registrationKind", isu.institution_type AS "institutionType",
           s.subscription_lifecycle_state AS "subscriptionLifecycleState", s.grace_ends_at AS "graceEndsAt"
    FROM users u
    JOIN schools s ON s.id = u.school_id
    LEFT JOIN campuses c ON c.id = u.campus_id
    LEFT JOIN institution_setups isu ON isu.school_id = u.school_id
    WHERE u.id = ${userId} AND u.school_id = ${schoolId} AND u.is_active = true
    LIMIT 1`);
  return rows[0] ? normalise(rows[0]) : null;
}

type PrefetchRow = Partial<AccountRow> & { sessions: SessionActivity[] | string | null };

/**
 * Session rows for the token and the account, in one round trip, kept for this request. Read once per request: every
 * getAuthUser() call used to repeat it, so the 10 handlers of one /api/shell call ran it 11 times (SKAI-1951).
 */
export async function prefetchAuth(tokenHash: string, userId: string, schoolId: string): Promise<void> {
  const s = await requestStore();
  if (!s) return readAuth(tokenHash, userId, schoolId, null);
  const key = `${tokenHash}\u0000${accountKey(userId, schoolId)}`;
  const hit = s.prefetches.get(key);
  if (hit) return hit;
  const value = readAuth(tokenHash, userId, schoolId, s);
  s.prefetches.set(key, value);
  value.catch(() => s.prefetches.delete(key));
  return value;
}

async function readAuth(tokenHash: string, userId: string, schoolId: string, s: Store | null): Promise<void> {
  const now = new Date();
  const rows = await runUnscoped("authenticate session and account in one read", () => prisma.$queryRaw<PrefetchRow[]>`
    SELECT
      (SELECT coalesce(json_agg(json_build_object('isActive', x.is_active)), '[]'::json)
         FROM (SELECT is_active FROM login_sessions WHERE token_hash = ${tokenHash} AND expires_at > ${now} LIMIT 10) x) AS sessions,
      acct.*
    FROM (SELECT 1) AS one
    LEFT JOIN LATERAL (
      SELECT u.id, u.school_id AS "schoolId", u.campus_id AS "campusId", u.role::text AS role, u.email, u.full_name AS "fullName",
             u.onboarding_complete AS "onboardingComplete", u.mfa_enabled AS "mfaEnabled", u.is_institution_owner AS "isInstitutionOwner",
             u.can_purchase_subscription AS "canPurchaseSubscription", u.can_manage_memberships AS "canManageMemberships",
             u.access_version AS "accessVersion", c.school_id AS "campusSchoolId", s.slug, s.status,
             s.registration_kind AS "registrationKind", isu.institution_type AS "institutionType",
             s.subscription_lifecycle_state AS "subscriptionLifecycleState", s.grace_ends_at AS "graceEndsAt"
      FROM users u
      JOIN schools s ON s.id = u.school_id
      LEFT JOIN campuses c ON c.id = u.campus_id
      LEFT JOIN institution_setups isu ON isu.school_id = u.school_id
      WHERE u.id = ${userId} AND u.school_id = ${schoolId} AND u.is_active = true
      LIMIT 1
    ) acct ON true`);
  const row = rows[0];
  const raw = row?.sessions ?? [];
  const sessions = (typeof raw === "string" ? JSON.parse(raw) : raw) as SessionActivity[];
  const { sessions: _ignored, ...account } = row ?? { sessions: null };
  if (!s) return;
  s.sessions.set(tokenHash, Promise.resolve(sessions.map((x) => ({ isActive: x.isActive === true }))));
  s.accounts.set(accountKey(userId, schoolId), account.id ? normalise(account as AccountRow) : null);
}

/** Prefetched account for this request (null = no active account), or undefined when nothing was prefetched. */
export async function prefetchedAccount(userId: string, schoolId: string): Promise<AccountRow | null | undefined> {
  const s = await requestStore();
  const key = accountKey(userId, schoolId);
  return s && s.accounts.has(key) ? s.accounts.get(key)! : undefined;
}
