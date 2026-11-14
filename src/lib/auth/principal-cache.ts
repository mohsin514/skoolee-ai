// ─────────────────────────────────────────────────────────────────
// Principal cache (docs/architecture/scale-10m-concurrent.md §3.2).
//
// Every authenticated request resolves the signed claims to a live principal:
// the account, its campus and school, and the institution kind. That read ran
// on every request, often twice (getAuthUser and the tenant context). Here it
// is cached in Redis for a short TTL so a warm request costs one Redis round
// trip instead of database joins.
//
// Freshness comes from version numbers ("epochs"), not from the TTL. The cache
// key embeds a global, a per-school and a per-user epoch. Any write to the rows
// the principal is built from (user, school, campus, institution setup) bumps
// the matching epoch through a Prisma extension, so the very next request
// misses and reads the database. Writes we cannot attribute bump the global
// epoch. The TTL only bounds the rare race of a read overlapping an
// uncommitted write.
//
// Off unless PRINCIPAL_CACHE=on and REDIS_URL is set. When Redis is slow or
// down the guard falls back to the database, so the cache can make requests
// faster but never makes them fail. Only resolved principals are cached;
// a denial is always read fresh.
// ─────────────────────────────────────────────────────────────────
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { AuthUser } from "@/lib/auth";
import { createRedisGuard, type RedisGuard } from "@/lib/redis/guard";

export type PrincipalClaims = { userId: string; schoolId: string; role?: unknown; accessVersion?: unknown; mfaVerified?: unknown };

/** The subset of ioredis the cache needs, so tests can pass a fake. */
export interface CacheClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

export type InvalidationTargets = { global: boolean; schools: string[]; users: string[] };

const GLOBAL_EPOCH = "pe:g";
const schoolEpoch = (schoolId: string) => `pe:s:${schoolId}`;
const userEpoch = (userId: string) => `pe:u:${userId}`;
/** Epoch keys outlive any cache entry by far; an expired epoch only ever restarts a counter. */
const EPOCH_TTL_SECONDS = 86_400;

// Read the three epochs and the entry they address in one round trip.
const READ_SCRIPT = `
local g = redis.call('GET', KEYS[1]) or '0'
local s = redis.call('GET', KEYS[2]) or '0'
local u = redis.call('GET', KEYS[3]) or '0'
local key = 'pc:' .. g .. ':' .. s .. ':' .. u .. ':' .. ARGV[1]
return {key, redis.call('GET', key)}`;

const WRITE_SCRIPT = `redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]) return 1`;

const BUMP_SCRIPT = `
for i, k in ipairs(KEYS) do
  redis.call('INCR', k)
  redis.call('EXPIRE', k, ARGV[1])
end
return #KEYS`;

/** A fixed-length id for everything in the claims that changes the outcome. */
function claimsId(claims: PrincipalClaims) {
  const parts = [claims.userId, claims.schoolId, claims.role ?? null, claims.accessVersion ?? null, claims.mfaVerified ?? null];
  return createHash("sha256").update(JSON.stringify(parts)).digest("base64url").slice(0, 32);
}

export function principalCacheEnabled(env: Record<string, string | undefined> = process.env) {
  return env.PRINCIPAL_CACHE === "on" && Boolean(env.REDIS_URL?.trim()) && env.REDIS_ENABLED?.trim().toLowerCase() !== "false";
}

export function createPrincipalCache({ client, enabled, ttlSeconds = 30, guard = createRedisGuard() }: {
  client: () => Promise<CacheClient>;
  enabled: boolean;
  ttlSeconds?: number;
  guard?: RedisGuard;
}) {
  async function resolve(claims: PrincipalClaims, load: () => Promise<AuthUser | null>): Promise<AuthUser | null> {
    if (!enabled) return load();
    const hit = await guard(async () => {
      const redis = await client();
      const reply = await redis.eval(READ_SCRIPT, 3, GLOBAL_EPOCH, schoolEpoch(claims.schoolId), userEpoch(claims.userId), claimsId(claims));
      if (!Array.isArray(reply) || typeof reply[0] !== "string") throw new Error("principal-cache: unexpected reply");
      return { key: reply[0] as string, value: typeof reply[1] === "string" ? reply[1] : null };
    }, null);

    if (hit?.value) {
      try { return JSON.parse(hit.value) as AuthUser; } catch { /* a corrupt entry is just a miss */ }
    }
    const principal = await load();
    if (principal && hit) {
      await guard(async () => (await client()).eval(WRITE_SCRIPT, 1, hit.key, JSON.stringify(principal), ttlSeconds), null);
    }
    return principal;
  }

  async function invalidate(targets: InvalidationTargets) {
    if (!enabled) return;
    const keys = [...(targets.global ? [GLOBAL_EPOCH] : []), ...new Set(targets.schools.map(schoolEpoch)), ...new Set(targets.users.map(userEpoch))];
    if (keys.length === 0) return;
    await guard(async () => (await client()).eval(BUMP_SCRIPT, keys.length, ...keys, EPOCH_TTL_SECONDS), null);
  }

  return { resolve, invalidate };
}

const WRITE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);
/** User columns that change another account's principal (the institution kind reads the school's owner). */
const SCHOOL_WIDE_USER_FIELDS = ["isInstitutionOwner", "role", "schoolId"];

type Args = { where?: Record<string, unknown>; data?: unknown; update?: unknown; create?: unknown } | undefined;

const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);
const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined);

/**
 * Which epochs a write must bump, or null when the write cannot affect any principal.
 * Anything we cannot attribute to a school or user bumps the global epoch: a
 * needless miss is cheap, a stale principal is not.
 */
export function invalidationTargets(model: string, operation: string, args: Args, contextSchoolId?: string): InvalidationTargets | null {
  if (!WRITE_OPERATIONS.has(operation)) return null;
  const where = record(args?.where) ?? {};
  const rows = Array.isArray(args?.data) ? args.data.map(record) : [record(args?.data ?? args?.update ?? args?.create)];
  const targets: InvalidationTargets = { global: false, schools: [], users: [] };
  const schoolOf = (row?: Record<string, unknown>) => str(where.schoolId) ?? str(row?.schoolId) ?? str(contextSchoolId);
  const bumpSchools = () => {
    for (const row of rows) {
      const schoolId = schoolOf(row);
      if (schoolId) targets.schools.push(schoolId);
      else targets.global = true;
    }
  };

  switch (model) {
    case "User": {
      const id = str(where.id);
      if (id) targets.users.push(id);
      const schoolWide = !id || operation.startsWith("create") || operation.startsWith("delete") || operation === "upsert" || rows.some((row) => SCHOOL_WIDE_USER_FIELDS.some((field) => row && field in row));
      if (schoolWide) bumpSchools();
      return targets;
    }
    case "School": {
      // A new school has no principals yet.
      if (operation.startsWith("create")) return null;
      const id = str(where.id);
      if (id) targets.schools.push(id);
      else targets.global = true;
      return targets;
    }
    case "Campus":
    case "InstitutionSetup":
      bumpSchools();
      return targets;
    default:
      return null;
  }
}

let shared: ReturnType<typeof createPrincipalCache> | null = null;

/** The process-wide cache. The Redis client is imported lazily so importing this module never dials Redis. */
export function principalCache() {
  shared ??= createPrincipalCache({
    enabled: principalCacheEnabled(),
    ttlSeconds: Math.max(1, Number.parseInt(process.env.PRINCIPAL_CACHE_TTL_SECONDS ?? "", 10) || 30),
    client: async () => (await import("@/lib/queue/connection")).redis as unknown as CacheClient,
  });
  return shared;
}

// SKAI-1982: inside an interactive transaction the epoch bump waits for the commit. Bumping before commit held the
// transaction open for a Redis round trip per write, and let a concurrent reader cache the pre-change row under the
// new epoch for the TTL. After commit, one combined bump makes the next read miss and load the committed row.
type PendingBumps = { targets: InvalidationTargets[]; flushed: boolean };
declare global { var __skooleePrincipalBumps: AsyncLocalStorage<PendingBumps> | undefined; }
const pendingBumps = globalThis.__skooleePrincipalBumps ??= new AsyncLocalStorage<PendingBumps>();
type Invalidate = (targets: InvalidationTargets) => Promise<void>;
const sharedInvalidate: Invalidate = targets => principalCache().invalidate(targets);

/** Pure: one set of targets covering every collected write. */
export function mergeInvalidationTargets(all: InvalidationTargets[]): InvalidationTargets {
  return { global: all.some(t => t.global), schools: [...new Set(all.flatMap(t => t.schools))], users: [...new Set(all.flatMap(t => t.users))] };
}

/** Called after each write: deferred to the commit inside `afterCommitInvalidation`, otherwise awaited now (read-your-writes). */
export async function invalidateAfterWrite(targets: InvalidationTargets, invalidate: Invalidate = sharedInvalidate) {
  const pending = pendingBumps.getStore();
  if (pending && !pending.flushed) pending.targets.push(targets);
  else await invalidate(targets);
}

/**
 * Runs a whole interactive transaction (begin to commit). Writes inside it only collect their targets; once it
 * settles they are bumped in one awaited call. A rollback still bumps what was collected: a write made with the
 * top-level client inside the callback committed on its own, and a needless miss is cheap where a stale principal is not.
 */
export async function afterCommitInvalidation<T>(transaction: () => Promise<T>, invalidate: Invalidate = sharedInvalidate): Promise<T> {
  const pending: PendingBumps = { targets: [], flushed: false };
  try {
    return await pendingBumps.run(pending, transaction);
  } finally {
    pending.flushed = true; // a write that outlives the transaction bumps for itself
    if (pending.targets.length) await invalidate(mergeInvalidationTargets(pending.targets));
  }
}
