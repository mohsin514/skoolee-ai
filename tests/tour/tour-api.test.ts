/**
 * /api/auth/tour — own account only, same-origin, validated, idempotent (SPEC §9.5, §9.8).
 * Executes the real route with synthetic persistence/session boundaries; validation and same-origin stay real.
 *   node --import tsx --test tests/tour/tour-api.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { SignJWT } from "jose";
import type { AuthUser } from "../../src/lib/auth";
import * as apiScope from "../../src/lib/api/scope";
import * as sameOrigin from "../../src/lib/auth/same-origin";
import * as tours from "../../src/lib/onboarding/tours";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const routeCode: string = transformSync(readFileSync(resolve("src/app/api/auth/tour/route.ts"), "utf8"), { loader: "ts", format: "cjs" }).code;

type Row = { id: string; schoolId: string; isActive: boolean; tourProgress: unknown; welcomeCompletedAt: Date | null; mustChangePassword: boolean };
type Grant = { id: string; schoolId: string; requestedById: string; status: string; revokedAt: Date | null; expiresAt: Date };
type GrantWhere = { id: string; schoolId: string; requestedById: string; status: string; revokedAt: null; expiresAt: { gt: Date } };

/** The support-session marker is a signed JWT (support-access.ts issueSupportCookie); the route verifies it for real. */
const SECRET = new TextEncoder().encode("tour-api-synthetic-secret");
const supportToken = (claims: Record<string, unknown> = {}, secret = SECRET) => {
  const jwt = new SignJWT({ purpose: "support_grant", grantId: "grant-1", schoolId: "school-z", actorId: "user-a", ...claims })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt();
  return ("exp" in claims ? jwt : jwt.setExpirationTime("2h")).sign(secret);
};
const activeGrant = (): Grant => ({ id: "grant-1", schoolId: "school-z", requestedById: "user-a", status: "active", revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) });

function fixture(options: { role?: AuthUser["role"]; row?: Partial<Row> | null; suspended?: boolean; exam?: boolean; afterRead?: (row: Row, read: number) => void; grant?: Grant | null } = {}) {
  const actor: AuthUser = { userId: "user-a", schoolId: "school-a", campusId: "campus-a", role: options.role ?? "TEACHER", email: "synthetic@example.invalid", accessVersion: 1 };
  const row: Row | null = options.row === null ? null : { id: "user-a", schoolId: "school-a", isActive: true, tourProgress: {}, welcomeCompletedAt: new Date(), mustChangePassword: false, ...options.row };
  const grant = options.grant === undefined ? activeGrant() : options.grant;
  const state = { reads: [] as unknown[], writes: [] as Array<{ where: unknown; data: { tourProgress: unknown } }>, authOptions: [] as unknown[], unscoped: [] as string[], grantReads: [] as GrantWhere[] };
  const db = {
    user: {
      findFirst: async (args: { where: { id: string; schoolId: string; isActive: boolean } }) => {
        state.reads.push(args.where);
        const found = row && args.where.id === row.id && args.where.schoolId === row.schoolId && args.where.isActive === row.isActive ? { ...row } : null;
        // A concurrent writer (another tab) can change the row between this read and the caller's update.
        if (row && found) options.afterRead?.(row, state.reads.length);
        return found;
      },
      // Behaves like Postgres: the JSON guard (`tourProgress: { equals }`) only matches the value currently stored.
      updateMany: async (args: { where: { tourProgress?: { equals: unknown } }; data: { tourProgress: unknown } }) => {
        state.writes.push(args);
        const matches = Boolean(row) && (!args.where.tourProgress || isDeepStrictEqual(args.where.tourProgress.equals, row!.tourProgress));
        if (row && matches) row.tourProgress = args.data.tourProgress;
        return { count: matches ? 1 : 0 };
      },
    },
    // Behaves like the database: only an active, unrevoked, unexpired grant of this actor matches.
    supportGrant: {
      findFirst: async (args: { where: GrantWhere }) => {
        state.grantReads.push(args.where);
        const w = args.where;
        const live = grant && grant.id === w.id && grant.schoolId === w.schoolId && grant.requestedById === w.requestedById
          && grant.status === w.status && grant.revokedAt === null && grant.expiresAt > w.expiresAt.gt;
        return live ? { id: grant.id } : null;
      },
    },
  };
  const loaded = { exports: {} as typeof import("../../src/app/api/auth/tour/route") };
  const boundary = (id: string) => {
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/db/tenant-context") return { runUnscoped: (purpose: string, fn: () => unknown) => { state.unscoped.push(purpose); return fn(); } };
    if (id === "@/lib/api/scope") return { ...apiScope, requireAuthUser: async (opts: unknown) => { state.authOptions.push(opts); return actor; } };
    if (id === "@/lib/auth/same-origin") return sameOrigin;
    if (id === "@/lib/auth/secret") return { JWT_SECRET: SECRET };
    if (id === "@/lib/billing/entitlements") return { assertSchoolOperational: async () => { if (options.suspended) throw Object.assign(new Error("Subscription suspended"), { status: 402 }); } };
    if (id === "@/lib/school-ai/exam-boundary-service") return { candidateExamBoundary: async () => (options.exam ? { attemptId: "attempt-1" } : null) };
    if (id === "@/lib/onboarding/tours") return tours;
    return require(id);
  };
  new Function("module", "exports", "require", routeCode)(loaded, loaded.exports, boundary);
  return { route: loaded.exports, state, row };
}

const origin = "http://school.test";
const get = (headers: Record<string, string> = {}) => new Request(`${origin}/api/auth/tour`, { headers });
const post = (body: unknown, headers: Record<string, string> = { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" }) =>
  new Request(`${origin}/api/auth/tour`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

test("GET returns only the caller's own progress, readable while suspended, never cached", async () => {
  const { route, state } = fixture({ row: { tourProgress: { teacher: { v: 1, s: "done", at: "t" }, junk: { v: 1, s: "done" } } } });
  const response = await route.GET(get());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.deepEqual(body, { progress: { teacher: { v: 1, s: "done", at: "t" } }, userId: "user-a", welcomeCompleted: true, autoStartBlocked: false, supportSession: false });
  assert.deepEqual(state.reads, [{ id: "user-a", schoolId: "school-a", isActive: true }]);
  assert.deepEqual(state.authOptions, [{ allowSuspended: true }]);
  assert.equal(state.writes.length, 0);
});

test("GET blocks auto-start for a password change, a support session, a suspended school and a candidate exam", async () => {
  const blocked = async (f: ReturnType<typeof fixture>, headers: Record<string, string> = {}) => (await (await f.route.GET(get(headers))).json()).autoStartBlocked;
  assert.equal(await blocked(fixture({ row: { mustChangePassword: true } })), true);
  assert.equal(await blocked(fixture(), { cookie: `a=1; skoolee_support_grant=${await supportToken()}` }), true);
  assert.equal(await blocked(fixture({ suspended: true })), true);
  assert.equal(await blocked(fixture({ role: "STUDENT", exam: true })), true);
  assert.equal(await blocked(fixture({ role: "TEACHER", exam: true })), false, "only learners sit candidate exams");
  assert.equal(await blocked(fixture({ role: "APP_OWNER", suspended: true })), false, "the platform operator has no tenant subscription");
  assert.equal((await (await fixture({ row: { welcomeCompletedAt: null } }).route.GET(get())).json()).welcomeCompleted, false);
});

test("GET for an account that no longer exists is 401", async () => {
  const response = await fixture({ row: null }).route.GET(get());
  assert.equal(response.status, 401);
});

test("POST refuses cross-site requests before touching the account", async () => {
  const crossSite: Array<Record<string, string>> = [
    { origin: "https://evil.test", "content-type": "application/json" },
    { "sec-fetch-site": "cross-site", "content-type": "application/json" },
  ];
  for (const headers of crossSite) {
    const { route, state } = fixture();
    const response = await route.POST(post({ tourId: "teacher", version: 1, status: "done" }, headers));
    assert.equal(response.status, 403);
    assert.equal(state.reads.length + state.writes.length, 0);
  }
});

test("POST rejects unknown tours, statuses, future versions, foreign fields and malformed bodies", async () => {
  for (const body of [
    { tourId: "nope", version: 1, status: "done" },
    { tourId: "teacher", version: 1, status: "started" },
    { tourId: "teacher", version: 2, status: "done" },
    { tourId: "teacher", version: 0, status: "done" },
    { tourId: "teacher", version: 1, status: "done", userId: "user-b" },
    "not json",
  ]) {
    const { route, state } = fixture();
    const response = await route.POST(post(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(state.writes.length, 0);
  }
});

test("POST merges into the caller's own row and is idempotent", async () => {
  const { route, state, row } = fixture({ row: { tourProgress: { super: { v: 1, s: "done", at: "earlier" } } } });
  const first = await route.POST(post({ tourId: "teacher", version: 1, status: "dismissed" }));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true });
  assert.equal(state.writes.length, 1);
  assert.deepEqual(state.writes[0].where, { id: "user-a", schoolId: "school-a", isActive: true, tourProgress: { equals: { super: { v: 1, s: "done", at: "earlier" } } } }, "own row only, and only while it still holds what was read");
  const stored = row!.tourProgress as Record<string, { v: number; s: string }>;
  assert.equal(stored.super.s, "done", "other tours are kept");
  assert.equal(stored.teacher.s, "dismissed");
  const again = await route.POST(post({ tourId: "teacher", version: 1, status: "dismissed" }));
  assert.equal(again.status, 200);
  assert.equal(state.writes.length, 1, "the same status at the same version writes nothing");
  await route.POST(post({ tourId: "teacher", version: 1, status: "done" }));
  assert.equal(state.writes.length, 2);
  assert.ok(state.unscoped.every((purpose) => /authenticated account/.test(purpose)));
});

test("POST is a compare-and-swap: a record written by another tab in between is kept, not overwritten", async () => {
  const { route, state, row } = fixture({
    row: { tourProgress: {} },
    // Another tab finishes the super tour right after this request's first read.
    afterRead: (current, read) => { if (read === 1) current.tourProgress = { super: { v: 1, s: "done", at: "other-tab" } }; },
  });
  const response = await route.POST(post({ tourId: "teacher", version: 1, status: "done" }));
  assert.equal(response.status, 200);
  assert.equal(state.reads.length, 2, "the losing write re-reads");
  assert.equal(state.writes.length, 2, "the first, stale write matched nothing");
  const stored = row!.tourProgress as Record<string, { v: number; s: string; at: string }>;
  assert.equal(stored.super.at, "other-tab", "the other tab's record survives");
  assert.equal(stored.teacher.s, "done");
});

test("POST gives up with 409 when the row keeps changing, and writes nothing stale", async () => {
  let n = 0;
  const { route, state } = fixture({ afterRead: (current) => { n += 1; current.tourProgress = { super: { v: 1, s: "done", at: `tab-${n}` } }; } });
  const response = await route.POST(post({ tourId: "teacher", version: 1, status: "done" }));
  assert.equal(response.status, 409);
  assert.ok(state.writes.length >= 1);
});

test("a scoped support session is flagged on GET and records nothing on POST", async () => {
  const support = { cookie: `skoolee_support_grant=${await supportToken()}` };
  const read = fixture();
  const body = await (await read.route.GET(get(support))).json();
  assert.equal(body.supportSession, true);
  assert.equal(body.autoStartBlocked, true);
  const write = fixture();
  const response = await write.route.POST(post({ tourId: "teacher", version: 1, status: "done" }, { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", ...support }));
  assert.equal(response.status, 200);
  assert.equal(write.state.writes.length, 0, "the helped account's progress is never written by support");
});

test("a stale support cookie (expired, revoked or foreign grant, bad signature) never switches tours off", async () => {
  const stale: Array<{ name: string; grant?: Grant | null; token?: Promise<string> }> = [
    { name: "grant expired", grant: { ...activeGrant(), expiresAt: new Date(Date.now() - 60_000) } },
    { name: "grant revoked", grant: { ...activeGrant(), status: "revoked", revokedAt: new Date() } },
    { name: "grant ended", grant: { ...activeGrant(), status: "expired" } },
    { name: "grant gone", grant: null },
    { name: "another operator's marker", token: supportToken({ actorId: "user-b" }) },
    { name: "not a support marker", token: supportToken({ purpose: "session" }) },
    { name: "forged signature", token: supportToken({}, new TextEncoder().encode("someone-else")) },
    { name: "marker past its own expiry", token: supportToken({ exp: Math.floor(Date.now() / 1000) - 60 }) },
  ];
  for (const { name, grant, token } of stale) {
    const cookie = { cookie: `skoolee_support_grant=${await (token ?? supportToken())}` };
    const read = fixture({ grant });
    const body = await (await read.route.GET(get(cookie))).json();
    assert.equal(body.supportSession, false, name);
    assert.equal(body.autoStartBlocked, false, name);
    const write = fixture({ grant });
    const response = await write.route.POST(post({ tourId: "teacher", version: 1, status: "done" }, { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", ...cookie }));
    assert.equal(response.status, 200, name);
    assert.equal(write.state.writes.length, 1, `${name}: progress is recorded as usual`);
  }
  // The live check reads only the signed-in operator's own grant.
  const checked = fixture();
  await checked.route.GET(get({ cookie: `skoolee_support_grant=${await supportToken()}` }));
  assert.deepEqual(checked.state.grantReads.map(({ id, schoolId, requestedById, status, revokedAt }) => ({ id, schoolId, requestedById, status, revokedAt })),
    [{ id: "grant-1", schoolId: "school-z", requestedById: "user-a", status: "active", revokedAt: null }]);
  assert.ok(checked.state.unscoped.every((purpose) => /authenticated account/.test(purpose)));
});
