import { test } from "node:test";
import assert from "node:assert/strict";
import { afterCommitInvalidation, createPrincipalCache, invalidateAfterWrite, invalidationTargets, mergeInvalidationTargets, principalCacheEnabled, type CacheClient, type InvalidationTargets } from "../../src/lib/auth/principal-cache";
import { createRedisGuard } from "../../src/lib/redis/guard";
import type { AuthUser } from "../../src/lib/auth";

/** Runs the cache's three scripts against a Map, the way Redis would. */
function fakeRedis() {
  const store = new Map<string, string>();
  const client: CacheClient = {
    async eval(script, numKeys, ...args) {
      const keys = args.slice(0, numKeys).map(String);
      const argv = args.slice(numKeys).map(String);
      if (script.includes("INCR")) {
        for (const key of keys) store.set(key, String(Number(store.get(key) ?? "0") + 1));
        return keys.length;
      }
      if (script.includes("'SET'")) { store.set(keys[0], argv[0]); return 1; }
      const [g, s, u] = keys.map((key) => store.get(key) ?? "0");
      const key = `pc:${g}:${s}:${u}:${argv[0]}`;
      return [key, store.get(key) ?? null];
    },
  };
  return { client, store };
}

const principal = (overrides: Partial<AuthUser> = {}): AuthUser => ({ userId: "user-a", schoolId: "school-1", email: "qa-01@example.test", role: "TEACHER", campusId: "campus-1", accessVersion: 0, ...overrides });
const claims = { userId: "user-a", schoolId: "school-1", role: "TEACHER", accessVersion: 0, mfaVerified: false };

function setup() {
  const redis = fakeRedis();
  const cache = createPrincipalCache({ client: async () => redis.client, enabled: true });
  let loads = 0;
  let current: AuthUser | null = principal();
  const load = async () => { loads++; return current; };
  return { cache, redis, load, loads: () => loads, set: (value: AuthUser | null) => { current = value; } };
}

test("a warm request is served from the cache without loading", async () => {
  const { cache, load, loads } = setup();
  assert.deepEqual(await cache.resolve(claims, load), principal());
  assert.deepEqual(await cache.resolve(claims, load), principal());
  assert.equal(loads(), 1);
});

test("deactivating the account (a user write) makes the next request read fresh and deny", async () => {
  const { cache, load, loads, set } = setup();
  await cache.resolve(claims, load);
  set(null);
  await cache.invalidate(invalidationTargets("User", "update", { where: { id: "user-a" }, data: { isActive: false } })!);
  assert.equal(await cache.resolve(claims, load), null);
  assert.equal(loads(), 2);
});

test("a school change invalidates every principal of that school, and only that school", async () => {
  const { cache, load, loads } = setup();
  const other = { ...claims, userId: "user-b", schoolId: "school-2" };
  await cache.resolve(claims, load);
  await cache.resolve(other, load);
  await cache.invalidate(invalidationTargets("School", "update", { where: { id: "school-1" }, data: { status: "SUSPENDED" } })!);
  await cache.resolve(claims, load);
  await cache.resolve(other, load);
  assert.equal(loads(), 3, "school-1 reloads, school-2 stays cached");
});

test("an unattributable write bumps the global epoch and invalidates everyone", async () => {
  const { cache, load, loads } = setup();
  await cache.resolve(claims, load);
  const targets = invalidationTargets("User", "updateMany", { where: { email: { contains: "x" } }, data: { isActive: false } });
  assert.deepEqual(targets, { global: true, schools: [], users: [] });
  await cache.invalidate(targets!);
  await cache.resolve(claims, load);
  assert.equal(loads(), 2);
});

test("a denial is never cached", async () => {
  const { cache, load, loads, set } = setup();
  set(null);
  await cache.resolve(claims, load);
  set(principal());
  assert.deepEqual(await cache.resolve(claims, load), principal());
  assert.equal(loads(), 2);
});

test("different claims (e.g. a newer access version) never share an entry", async () => {
  const { cache, load, loads } = setup();
  await cache.resolve(claims, load);
  await cache.resolve({ ...claims, accessVersion: 1 }, load);
  await cache.resolve({ ...claims, mfaVerified: true }, load);
  assert.equal(loads(), 3);
});

test("a hung Redis falls back to the database quickly", async () => {
  const hung: CacheClient = { eval: () => new Promise(() => {}) };
  const cache = createPrincipalCache({ client: async () => hung, enabled: true, guard: createRedisGuard({ timeoutMs: 10 }) });
  const started = Date.now();
  assert.deepEqual(await cache.resolve(claims, async () => principal()), principal());
  assert.ok(Date.now() - started < 500);
});

test("disabled, it always loads and never touches Redis", async () => {
  let touched = false;
  const cache = createPrincipalCache({ client: async () => { touched = true; return fakeRedis().client; }, enabled: false });
  let loads = 0;
  await cache.resolve(claims, async () => { loads++; return principal(); });
  await cache.resolve(claims, async () => { loads++; return principal(); });
  await cache.invalidate({ global: true, schools: [], users: [] });
  assert.equal(loads, 2);
  assert.equal(touched, false);
});

test("the flag needs PRINCIPAL_CACHE=on and a Redis URL", () => {
  assert.equal(principalCacheEnabled({}), false);
  assert.equal(principalCacheEnabled({ PRINCIPAL_CACHE: "on" }), false);
  assert.equal(principalCacheEnabled({ PRINCIPAL_CACHE: "on", REDIS_URL: "redis://r" }), true);
  assert.equal(principalCacheEnabled({ PRINCIPAL_CACHE: "on", REDIS_URL: "redis://r", REDIS_ENABLED: "false" }), false);
});

test("invalidation targets cover every way the principal's rows change", () => {
  assert.equal(invalidationTargets("User", "findFirst", { where: { id: "u" } }), null);
  assert.equal(invalidationTargets("Attendance", "update", { where: { id: "a" } }), null);
  // Ordinary profile edit: only that user.
  assert.deepEqual(invalidationTargets("User", "update", { where: { id: "u" }, data: { fullName: "x" } }, "s"), { global: false, schools: [], users: ["u"] });
  // Owner/role changes alter the institution kind for the whole school.
  assert.deepEqual(invalidationTargets("User", "update", { where: { id: "u" }, data: { isInstitutionOwner: true } }, "s"), { global: false, schools: ["s"], users: ["u"] });
  assert.deepEqual(invalidationTargets("User", "delete", { where: { id: "u" } }, "s"), { global: false, schools: ["s"], users: ["u"] });
  assert.deepEqual(invalidationTargets("User", "create", { data: { schoolId: "s2" } }), { global: false, schools: ["s2"], users: [] });
  assert.deepEqual(invalidationTargets("User", "createMany", { data: [{ schoolId: "s1" }, {}] }), { global: true, schools: ["s1"], users: [] });
  assert.deepEqual(invalidationTargets("School", "create", { data: {} }), null);
  assert.deepEqual(invalidationTargets("School", "update", { where: { slug: "x" } }), { global: true, schools: [], users: [] });
  assert.deepEqual(invalidationTargets("Campus", "update", { where: { id: "c" }, data: { name: "x" } }, "s"), { global: false, schools: ["s"], users: [] });
  assert.deepEqual(invalidationTargets("Campus", "update", { where: { id: "c" }, data: { name: "x" } }), { global: true, schools: [], users: [] });
  assert.deepEqual(invalidationTargets("InstitutionSetup", "upsert", { where: { schoolId: "s" }, create: {}, update: {} }), { global: false, schools: ["s"], users: [] });
});

// SKAI-1982: inside an interactive transaction the epoch bump waits for the commit, once, with every target.

test("writes inside a transaction bump once after it commits, for both schools; outside one they bump before returning", async () => {
  const bumps: InvalidationTargets[] = [];
  const invalidate = async (targets: InvalidationTargets) => { bumps.push(targets); };
  const result = await afterCommitInvalidation(async () => {
    await invalidateAfterWrite({ global: false, schools: [], users: ["user-a"] }, invalidate);
    await invalidateAfterWrite({ global: false, schools: ["school-a"], users: ["user-a"] }, invalidate);
    await invalidateAfterWrite({ global: false, schools: ["school-b"], users: ["user-b"] }, invalidate);
    assert.deepEqual(bumps, [], "nothing is bumped before the commit");
    return "committed";
  }, invalidate);
  assert.equal(result, "committed");
  assert.deepEqual(bumps, [{ global: false, schools: ["school-a", "school-b"], users: ["user-a", "user-b"] }]);
  bumps.length = 0;
  await invalidateAfterWrite({ global: false, schools: [], users: ["user-a"] }, invalidate);
  assert.equal(bumps.length, 1, "a write outside a transaction is bumped before it returns");
});

test("a transaction with no principal writes bumps nothing; a failed one still bumps what it collected", async () => {
  const bumps: InvalidationTargets[] = [];
  const invalidate = async (targets: InvalidationTargets) => { bumps.push(targets); };
  await afterCommitInvalidation(async () => "no writes", invalidate);
  assert.deepEqual(bumps, []);
  await assert.rejects(afterCommitInvalidation(async () => {
    await invalidateAfterWrite({ global: false, schools: ["school-a"], users: [] }, invalidate);
    throw new Error("rolled back");
  }, invalidate), /rolled back/);
  assert.deepEqual(bumps, [{ global: false, schools: ["school-a"], users: [] }]);
  assert.deepEqual(mergeInvalidationTargets([{ global: false, schools: [], users: [] }, { global: true, schools: [], users: [] }]).global, true);
});
