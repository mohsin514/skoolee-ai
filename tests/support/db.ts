/**
 * Database access for the logout suites.
 *
 * Uses a bare PrismaClient rather than the app's `@/lib/db/prisma`, on purpose:
 * the app client carries the tenant guard, which refuses any query without a
 * tenant context in scope. The guard is right for application code and wrong
 * for a test harness, which is deliberately looking across tenants to check
 * that a row it created by signing in is the row that logout closed.
 */
import { PrismaClient } from "@prisma/client";
import { resolveTarget } from "./env";
import { hashSessionToken } from "@/lib/auth/session-cookie";

let client: PrismaClient | null = null;

export function db(): PrismaClient {
  if (client) return client;

  const target = resolveTarget();
  client = new PrismaClient({
    datasourceUrl: target.databaseUrl,
    log: ["warn", "error"],
  });

  return client;
}

export async function disconnectDb(): Promise<void> {
  if (!client) return;
  await client.$disconnect();
  client = null;
}

export { hashSessionToken };

/**
 * Every token these suites have minted, so their rows can be removed afterwards.
 *
 * Not every test signs out — the cookie-contract and keyboard cases only need to
 * sign in — so without this each run leaves a few permanently-open rows behind.
 * On the dev database that is merely untidy (it inflates the very
 * active-sessions list this work exists to make trustworthy). On a remote target
 * it is unacceptable, which is why the plan calls for cleanup there; doing it in
 * both places means the cleanup path is exercised long before it matters.
 */
const mintedTokens = new Set<string>();

export function recordMintedToken(token: string): void {
  mintedTokens.add(token);
}

/**
 * Deletes the login_sessions rows for tokens this harness minted.
 *
 * Scoped to exactly those token hashes — never a broader predicate — so it
 * cannot reach a row belonging to a real session, which is what keeps it safe
 * to run against a remote target.
 *
 * The one subtlety is timing. recordLoginSession() is fire-and-forget on the
 * server, so the row for a token can be written slightly *after* the login
 * response that handed the harness the token. A test that signs in and does
 * little else can therefore reach cleanup before its own row exists — the
 * delete finds nothing, and the row appears moments later, orphaned. So this
 * does one short retry: if fewer rows were deleted than tokens were minted, it
 * waits briefly and sweeps again, giving the lagging writes time to land.
 */
export async function cleanupMintedSessions(): Promise<number> {
  if (mintedTokens.size === 0) return 0;

  const hashes = [...mintedTokens].map(hashSessionToken);
  const expected = hashes.length;
  mintedTokens.clear();

  const sweep = async (): Promise<number> => {
    const { count } = await db().loginSession.deleteMany({
      where: { tokenHash: { in: hashes } },
    });
    return count;
  };

  try {
    let deleted = await sweep();

    // A second pass catches rows whose fire-and-forget write had not committed
    // when the first pass ran.
    if (deleted < expected) {
      await new Promise((r) => setTimeout(r, 750));
      deleted += await sweep();
    }

    return deleted;
  } catch {
    // Cleanup is housekeeping; failing it must not fail an otherwise good run.
    return 0;
  }
}

export interface SessionRow {
  id: string;
  userId: string;
  schoolId: string;
  tokenHash: string;
  isActive: boolean;
  logoutAt: Date | null;
  loginAt: Date;
  expiresAt: Date;
}

/**
 * Every LoginSession row for a token, newest first.
 *
 * `tokenHash` is indexed but not unique, so this returns a list — and the
 * suites assert on the list rather than on "the" row. That is not defensive
 * padding: duplicates are the exact shape of the orphaned-row defect, so
 * collapsing them here would hide what the tests are looking for.
 */
export async function sessionRowsForToken(token: string): Promise<SessionRow[]> {
  return sessionRowsForHash(hashSessionToken(token));
}

export async function sessionRowsForHash(tokenHash: string): Promise<SessionRow[]> {
  const rows = await db().loginSession.findMany({
    where: { tokenHash },
    orderBy: { loginAt: "desc" },
    select: {
      id: true,
      userId: true,
      schoolId: true,
      tokenHash: true,
      isActive: true,
      logoutAt: true,
      loginAt: true,
      expiresAt: true,
    },
  });

  return rows;
}

/** Convenience for the common "exactly one row, and it is open" assertion. */
export async function activeSessionCount(token: string): Promise<number> {
  const rows = await sessionRowsForToken(token);
  return rows.filter((r) => r.isActive).length;
}

/**
 * Polls until the rows for a token satisfy `predicate`.
 *
 * Necessary because both writes involved are currently fire-and-forget: the
 * login route kicks off recordLoginSession() without awaiting it, and the
 * logout route does the same with its updateMany. So "the row is open" and "the
 * row is closed" are both eventually-true, and asserting them synchronously
 * right after the HTTP response would be a race that passes on a fast machine.
 *
 * Returns the last rows it saw, satisfied or not, so callers can assert on them
 * and produce a useful message rather than just "timed out".
 */
export async function waitForSessionRows(
  token: string,
  predicate: (rows: SessionRow[]) => boolean,
  timeoutMs = 5_000
): Promise<SessionRow[]> {
  const deadline = Date.now() + timeoutMs;
  let rows = await sessionRowsForToken(token);

  while (!predicate(rows) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    rows = await sessionRowsForToken(token);
  }

  return rows;
}

export async function findUserByEmail(email: string) {
  return db().user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      schoolId: true,
      campusId: true,
      mustChangePassword: true,
      onboardingComplete: true,
      school: { select: { id: true, slug: true, status: true } },
    },
  });
}

/** Any session row a user currently has open, for before/after comparisons. */
export async function openSessionsForUser(userId: string): Promise<SessionRow[]> {
  return db().loginSession.findMany({
    where: { userId, isActive: true },
    orderBy: { loginAt: "desc" },
    select: {
      id: true,
      userId: true,
      schoolId: true,
      tokenHash: true,
      isActive: true,
      logoutAt: true,
      loginAt: true,
      expiresAt: true,
    },
  });
}

/**
 * Throwaway accounts.
 *
 * Some flows can only be driven from a specific starting state — the
 * forced-password-change path needs an account with mustChangePassword still
 * set, and running it mutates that account's password. Doing that to a shared
 * QA fixture would leave the next run with a different password than
 * docs/qa/TEST-ACCOUNTS.md promises, so those cases get their own disposable
 * accounts instead.
 *
 * The prefix is what makes cleanup safe: deletion is scoped to addresses this
 * suite is known to have minted, never to a pattern that could match a real
 * account. That matters most on a remote target, where a broad delete would be
 * unrecoverable.
 */
export const THROWAWAY_PREFIX = "logout-suite-";

function throwawayEmail(label: string): string {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return `${THROWAWAY_PREFIX}${label}-${unique}@example.invalid`;
}

/** The tenant the QA fixtures live in, which throwaways join too. */
export async function fixtureSchoolId(): Promise<string> {
  const school = await db().school.findFirst({
    where: { slug: "t1-alpha" },
    select: { id: true },
  });

  if (!school) {
    throw new Error(
      `The QA fixture tenant (slug "t1-alpha") is missing. See docs/qa/TEST-ACCOUNTS.md.`
    );
  }

  return school.id;
}

export interface ThrowawayUser {
  id: string;
  email: string;
  password: string;
  role: string;
}

export async function createThrowawayUser(options: {
  label: string;
  role?: string;
  password: string;
  mustChangePassword?: boolean;
  onboardingComplete?: boolean;
}): Promise<ThrowawayUser> {
  const bcrypt = await import("bcryptjs");
  const schoolId = await fixtureSchoolId();
  const email = throwawayEmail(options.label);
  const role = options.role ?? "TEACHER";

  const user = await db().user.create({
    data: {
      email,
      fullName: `Logout Suite ${options.label}`,
      password: await bcrypt.default.hash(options.password, 10),
      role: role as never,
      schoolId,
      isActive: true,
      onboardingComplete: options.onboardingComplete ?? true,
      mustChangePassword: options.mustChangePassword ?? false,
    },
    select: { id: true, email: true },
  });

  return { id: user.id, email: user.email, password: options.password, role };
}

/**
 * Removes every throwaway account and the rows hanging off it.
 *
 * Sessions, password history and audit rows are deleted explicitly rather than
 * relying on cascade, because only `loginSessions` and `passwordHistory`
 * cascade from User — the audit relation is onDelete: SetNull, which would
 * otherwise leave orphaned rows behind on every run.
 */
export async function deleteThrowawayUsers(): Promise<number> {
  const users = await db().user.findMany({
    where: { email: { startsWith: THROWAWAY_PREFIX } },
    select: { id: true },
  });

  if (users.length === 0) return 0;

  const userIds = users.map((u) => u.id);

  await db().loginSession.deleteMany({ where: { userId: { in: userIds } } });
  await db().passwordHistory.deleteMany({ where: { userId: { in: userIds } } });
  await db().superAdminAuditLog.deleteMany({ where: { userId: { in: userIds } } });
  await db().user.deleteMany({ where: { id: { in: userIds } } });

  return users.length;
}

export async function latestAuditLog(userId: string, action: string) {
  return db().superAdminAuditLog.findFirst({
    where: { userId, action },
    orderBy: { createdAt: "desc" },
    select: { id: true, action: true, status: true, createdAt: true },
  });
}
