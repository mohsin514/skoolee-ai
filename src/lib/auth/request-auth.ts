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
import { Prisma } from "@prisma/client";
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

/**
 * Columns are UTC wall-clock `timestamp`s; a raw Date parameter is compared in the session time zone, which is off by
 * hours on a non-UTC database. Pin it to UTC so raw reads match Prisma's typed reads.
 */
const utc = (at: Date) => Prisma.sql`(${at}::timestamptz AT TIME ZONE 'UTC')`;

/** The live session rows for a token hash, as one json column (scoped by the hash; see session-revocation.ts). */
const sessionsColumn = (tokenHash: string, now: Date) => Prisma.sql`(SELECT coalesce(json_agg(json_build_object('isActive', x.is_active)), '[]'::json)
         FROM (SELECT is_active FROM login_sessions WHERE token_hash = ${tokenHash} AND expires_at > ${utc(now)} LIMIT 10) x) AS sessions`;

/** The exact signed account (same columns and filters as queryAccount), as a lateral join named acct. */
const accountLateral = (userId: string, schoolId: string) => Prisma.sql`LEFT JOIN LATERAL (
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
    ) acct ON true`;

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
      ${sessionsColumn(tokenHash, now)},
      acct.*
    FROM (SELECT 1) AS one
    ${accountLateral(userId, schoolId)}`);
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

export type CandidateBoundaryRow = { sessions: SessionActivity[]; account: AccountRow | null; attempt: { attemptId: string; assignmentId: string; deadlineAt: Date } | null };
type CandidateBoundaryRaw = PrefetchRow & { attemptId: string | null; assignmentId: string | null; deadlineAt: Date | null };

/**
 * SKAI-1971: the proxy's student exam-boundary inputs in ONE round trip — the token's session rows, the exact signed
 * account, and the learner's current in-progress attempt (same predicates as candidateExamBoundary). Never cached or
 * memoised: lockdown must reflect current state. The caller decides revocation and authority before using the attempt.
 */
export async function candidateBoundaryRead(tokenHash: string, userId: string, schoolId: string, now = new Date()): Promise<CandidateBoundaryRow> {
  const rows = await runUnscoped("check a signed student session for an active exam in one read", () => prisma.$queryRaw<CandidateBoundaryRaw[]>`
    SELECT
      ${sessionsColumn(tokenHash, now)},
      att.id AS "attemptId", att.assignment_id AS "assignmentId", att.deadline_at AS "deadlineAt",
      acct.*
    FROM (SELECT 1) AS one
    ${accountLateral(userId, schoolId)}
    LEFT JOIN LATERAL (
      SELECT st.id, st.campus_id, st.class_id FROM students st
      WHERE st.school_id = ${schoolId} AND st.student_user_id = ${userId} AND st.status = 'active' AND st.archived_at IS NULL
      LIMIT 1
    ) learner ON true
    LEFT JOIN LATERAL (
      SELECT a.id, a.assignment_id, a.deadline_at FROM school_ai_exam_attempts a
      JOIN school_ai_exam_assignments x ON x.id = a.assignment_id
      WHERE a.school_id = ${schoolId} AND a.user_id = ${userId} AND a.student_id = learner.id
        AND a.campus_id IS NOT DISTINCT FROM learner.campus_id AND a.status = 'IN_PROGRESS' AND a.deadline_at > ${utc(now)}
        AND x.school_id = ${schoolId} AND x.status = 'ACTIVE' AND x.mode IN ('STANDARD', 'SECURE_BROWSER')
        AND x.class_id IS NOT DISTINCT FROM learner.class_id AND x.student_ids @> jsonb_build_array(learner.id)
      ORDER BY a.started_at ASC, a.id ASC
      LIMIT 1
    ) att ON true`);
  const row = rows[0];
  const raw = row?.sessions ?? [];
  const sessions = ((typeof raw === "string" ? JSON.parse(raw) : raw) as SessionActivity[]).map((x) => ({ isActive: x.isActive === true }));
  const { sessions: _s, attemptId, assignmentId, deadlineAt, ...account } = row ?? { sessions: null, attemptId: null, assignmentId: null, deadlineAt: null };
  return {
    sessions,
    account: account.id ? normalise(account as AccountRow) : null,
    attempt: attemptId && assignmentId && deadlineAt ? { attemptId, assignmentId, deadlineAt: new Date(deadlineAt) } : null,
  };
}
