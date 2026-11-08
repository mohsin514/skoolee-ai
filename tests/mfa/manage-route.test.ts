/**
 * GET/POST /api/account/mfa end to end against the in-memory Prisma fake.
 *
 * The real tenant guard (src/lib/db/prisma.ts tenantGuard) is a Prisma
 * extension, and `globalThis.prisma = fake` bypasses it. So the fake is wrapped
 * in a Proxy guard double: any call on a TENANT_MODELS delegate (also on the
 * `tx` handed to `$transaction` callbacks) throws TenantContextError unless an
 * explicit, scoped tenant context for this school is in scope. That proves the
 * route keeps every tenant query inside its own runWithTenantContext even after
 * confirm/disable revoke the session mid-request.
 *
 * `requireAuthUser()` needs Next's request store, so the handler's
 * `requireUser` is injected with a stand-in that applies the same session
 * rules (live LoginSession row, accessVersion, mfaVerified) to the request
 * cookie, reading the fake's state directly.
 */
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { format } from "node:util";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { createFakePrisma } from "./fake-prisma";
import { ORIGIN, SCHOOL, newUser, stepAt } from "./harness";
import { TENANT_MODELS } from "@/lib/db/tenant-models";
import { TenantContextError, getTenantContext, runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session-cookie";

const AUTH_SECRET = "manage-route-test-auth-secret-0123456789abcdef0123";
Object.assign(process.env, { NODE_ENV: "test", AUTH_SECRET, DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" });
delete process.env.MFA_ENCRYPTION_KEY;
delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;

const T0 = Date.UTC(2026, 2, 9, 8, 0, 3);
/** Same literal as src/lib/auth/mfa-change-grant.ts, which reads AUTH_SECRET on import and so is loaded in before(). */
const MFA_CHANGE_COOKIE = "skoolee-mfa-change";
const PASSWORD = "Route-test-password-1";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

type Row = Record<string, unknown>;
const fake = createFakePrisma({ schools: [{ ...SCHOOL }] });
let guardedCalls = 0;

/** Throws unless a scoped context for this row's school is bound; mirrors the real guard's fail-closed rule. */
function assertTenantScope(model: string, args: unknown) {
  const context = getTenantContext();
  if (!context || context.unscoped || !context.schoolId) throw new TenantContextError(`guard double: ${model} queried outside an explicit tenant context`);
  const { where, data } = (args ?? {}) as { where?: Row; data?: Row };
  for (const schoolId of [where?.schoolId, data?.schoolId]) {
    if (schoolId !== undefined && schoolId !== context.schoolId) throw new TenantContextError(`guard double: ${model} for school ${String(schoolId)} inside ${context.schoolId}`);
  }
  if (context.schoolId !== SCHOOL.id) throw new TenantContextError(`guard double: ${model} inside foreign school ${context.schoolId}`);
}

function guardDouble<T extends object>(client: T): T {
  const delegates = new Map<string, unknown>();
  const guarded: T = new Proxy(client, {
    get(target, property, receiver) {
      // Interactive transactions get the guarded client as `tx`, so tx delegates are checked too.
      if (property === "$transaction") {
        return (first: unknown) => typeof first === "function" ? (first as (tx: T) => unknown)(guarded) : Promise.all(first as Promise<unknown>[]);
      }
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || !TENANT_MODELS.has(property)) return value;
      if (!delegates.has(property)) {
        delegates.set(property, new Proxy(value as object, {
          get(delegate, operation) {
            const method = Reflect.get(delegate, operation);
            if (typeof method !== "function") return method;
            return (args: unknown) => {
              assertTenantScope(property, args);
              guardedCalls++;
              return method.call(delegate, args);
            };
          },
        }));
      }
      return delegates.get(property);
    },
  });
  return guarded;
}

(globalThis as { prisma?: unknown }).prisma = guardDouble(fake);

let http: typeof import("@/lib/auth/mfa-manage-http");
let crypto: typeof import("@/lib/auth/mfa-crypto");
let appPrisma: typeof import("@/lib/db/prisma")["prisma"];
let issueSession: typeof import("@/lib/auth/issue-session")["issueSession"];
let NextRequestCtor: typeof import("next/server")["NextRequest"];
let deps: import("@/lib/auth/mfa-manage-http").ManageHttpDeps;
const logs: string[] = [];
const originalConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };

before(async () => {
  for (const level of ["log", "warn", "error", "info"] as const) console[level] = (...args: unknown[]) => { logs.push(format(...args)); };
  http = await import("@/lib/auth/mfa-manage-http");
  assert.equal((await import("@/lib/auth/mfa-change-grant")).MFA_CHANGE_COOKIE, MFA_CHANGE_COOKIE);
  crypto = await import("@/lib/auth/mfa-crypto");
  appPrisma = (await import("@/lib/db/prisma")).prisma;
  issueSession = (await import("@/lib/auth/issue-session")).issueSession;
  NextRequestCtor = (await import("next/server")).NextRequest;
  const { ApiError } = await import("@/lib/api/scope");
  const { jwtVerify } = await import("jose");
  const { JWT_SECRET } = await import("@/lib/auth/secret");
  deps = {
    async requireUser(req) {
      const denied = new ApiError("Your session is no longer valid. Please sign in again.", 401);
      const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (!token) throw new ApiError("Unauthorized", 401);
      const { payload } = await jwtVerify(token, JWT_SECRET).catch(() => { throw denied; });
      const live = fake.state.loginSessions.some(session => session.tokenHash === hashSessionToken(token) && session.isActive === true);
      const user = fake.state.users.find(candidate => candidate.id === payload.userId && candidate.schoolId === payload.schoolId && candidate.isActive) as (Row & { mfaEnabled: boolean; role: string }) | undefined;
      if (!live || !user || user.accessVersion !== payload.accessVersion) throw denied;
      if ((crypto.requiresMfa(user) && !user.mfaEnabled) || (crypto.needsMfaChallenge(user) && payload.mfaVerified !== true)) throw denied;
      return { userId: user.id as string, schoolId: user.schoolId as string, campusId: (user.campusId as string | null) ?? null, role: user.role as never, email: user.email as string };
    },
  };
});
after(() => Object.assign(console, originalConsole));
beforeEach(() => mock.timers.enable({ apis: ["Date"], now: T0 }));
afterEach(() => mock.timers.reset());

interface Result { status: number; json: Row; setCookies: string[]; cacheControl: string | null }
const show = (result: Result) => `${result.status} ${JSON.stringify(result.json)}`;
type StoredMfa = { mfaSecret: string | null; mfaPendingSecret: string | null; mfaPendingTicket: string | null; mfaEnrolledAt: Date | null };
const row = (id: string) => fake.state.users.find(candidate => candidate.id === id) as unknown as Omit<ReturnType<typeof newUser>, keyof StoredMfa> & StoredMfa;
const cookieValue = (result: Result, name: string) => result.setCookies.find(cookie => cookie.startsWith(`${name}=`))?.split(";")[0] ?? "";
const issued = (result: Result) => {
  const value = cookieValue(result, SESSION_COOKIE_NAME);
  return value && value !== `${SESSION_COOKIE_NAME}=` ? value : "";
};
const code = (secret: string, offset = 0) => crypto.totp(secret, stepAt(Date.now()) + offset);

async function call(method: "GET" | "POST", cookies: string[], body?: unknown, origin = ORIGIN): Promise<Result> {
  const req = new NextRequestCtor(`${ORIGIN}/api/account/mfa`, {
    method,
    headers: { cookie: cookies.filter(Boolean).join("; "), origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = method === "GET" ? await http.manageStatus(req, deps) : await http.manageMutation(req, deps);
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {}, setCookies: res.headers.getSetCookie(), cacheControl: res.headers.get("cache-control") };
}

/** A real session through issueSession (records the LoginSession row), as sign-in would. */
async function sessionFor(id: string, mfaVerified: boolean) {
  const response = await runWithTenantContext({ schoolId: SCHOOL.id, userId: id }, () => issueSession(row(id) as unknown as User, 7, mfaVerified, new Request(`${ORIGIN}/api/auth/login`)));
  const value = response.headers.getSetCookie().find(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0];
  return value;
}

function seedEnrolled(id: string, overrides: Record<string, unknown> = {}) {
  const secret = crypto.newAuthenticatorSecret();
  const codes = crypto.newRecoveryCodes();
  fake.state.users.push(newUser(id, { password: PASSWORD_HASH, mfaEnabled: true, mfaSecret: crypto.protectSecret(secret), recoveryCodeHashes: codes.map(crypto.recoveryHash), ...overrides }));
  return { secret, codes };
}

describe("tenant guard double", () => {
  it("throws for a tenant model outside any context, in a foreign or unscoped context, and on tx delegates", async () => {
    fake.state.users.push(newUser("guard-probe"));
    const query = () => appPrisma.user.findFirst({ where: { id: "guard-probe", schoolId: SCHOOL.id } });
    await assert.rejects(async () => query(), TenantContextError, "no context");
    await assert.rejects(runWithTenantContext({ schoolId: "school-other" }, async () => query()), TenantContextError, "foreign school");
    await assert.rejects(runUnscoped("probe", async () => query()), TenantContextError, "unscoped");
    await assert.rejects(async () => appPrisma.$transaction(async tx => tx.loginSession.updateMany({ where: { userId: "guard-probe" }, data: { isActive: false } })), TenantContextError, "tx delegate");
    assert.equal((await runWithTenantContext({ schoolId: SCHOOL.id }, async () => query()))?.id, "guard-probe");
    // Global models (rate limiter, school) need no context, as in the real guard.
    assert.ok(await appPrisma.school.findUnique({ where: { id: SCHOOL.id } }));
  });
});

describe("/api/account/mfa", () => {
  it("GET returns status with no secret, code or hash; 401 without a session", async () => {
    const id = "route-status";
    const { codes } = seedEnrolled(id);
    const session = await sessionFor(id, true);
    const status = await call("GET", [session]);
    assert.equal(status.status, 200, show(status));
    assert.equal(status.cacheControl, "no-store");
    assert.deepEqual(status.json, { enabled: true, required: true, enrolledAt: null, recoveryCodesRemaining: 10, recoveryCodesTotal: 10, authenticatorReadable: true });
    const text = JSON.stringify(status.json);
    assert.ok(!text.includes(row(id).mfaSecret as string) && !codes.some(value => text.includes(value)));
    const anonymous = await call("GET", []);
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.json.reason, "session_expired");
    assert.equal(anonymous.cacheControl, "no-store");
  });

  it("change: begin → confirm → reissued session; old cookie rejected, grant cleared, no-store", async () => {
    const id = "route-change";
    const old = seedEnrolled(id);
    const session = await sessionFor(id, true);
    const callsBefore = guardedCalls;

    const begin = await call("POST", [session], { action: "begin", mode: "change", password: PASSWORD, code: code(old.secret) });
    assert.equal(begin.status, 200, show(begin));
    assert.equal(begin.cacheControl, "no-store");
    assert.deepEqual(Object.keys(begin.json).sort(), ["expiresAt", "secret", "uri"]);
    const grantCookie = begin.setCookies.find(cookie => cookie.startsWith(`${MFA_CHANGE_COOKIE}=`))!;
    assert.match(grantCookie, /HttpOnly/i);
    assert.match(grantCookie, /SameSite=strict/i);
    assert.match(grantCookie, /Path=\/api\/account\/mfa/);
    assert.match(grantCookie, /Max-Age=600/);
    assert.equal(row(id).mfaEnabled, true);

    const noGrant = await call("POST", [session], { action: "confirm", code: code(begin.json.secret as string) });
    assert.equal(noGrant.status, 409, show(noGrant));
    assert.equal(noGrant.json.reason, "setup_expired");

    const grant = grantCookie.split(";")[0];
    const confirm = await call("POST", [session, grant], { action: "confirm", code: code(begin.json.secret as string) });
    assert.equal(confirm.status, 200, show(confirm));
    assert.equal(confirm.cacheControl, "no-store");
    assert.equal(confirm.json.success, true);
    assert.equal((confirm.json.recoveryCodes as string[]).length, 10);
    assert.equal((confirm.json.user as Row).id, id);
    const fresh = issued(confirm);
    assert.ok(fresh, "a new skoolee_token is set");
    assert.match(confirm.setCookies.find(cookie => cookie.startsWith(`${MFA_CHANGE_COOKIE}=`))!, /Max-Age=0/, "grant cookie cleared");
    assert.ok(guardedCalls > callsBefore, "tenant-model queries went through the guard double");

    assert.equal((await call("GET", [session])).status, 401, "the pre-change cookie is revoked");
    const after = await call("GET", [fresh]);
    assert.equal(after.status, 200, show(after));
    assert.equal(after.json.enabled, true);
    assert.equal(typeof after.json.enrolledAt, "string");
    assert.equal(fake.state.loginSessions.filter(item => item.userId === id && item.isActive).length, 1, "only the reissued session is live");
  });

  it("enable → disable for an optional role, each reissuing the session", async () => {
    const id = "route-optional";
    fake.state.users.push(newUser(id, { role: "TEACHER", isInstitutionOwner: false, password: PASSWORD_HASH }));
    const first = await sessionFor(id, false);

    const begin = await call("POST", [first], { action: "begin", mode: "enable", password: PASSWORD });
    assert.equal(begin.status, 200, show(begin));
    const grant = cookieValue(begin, MFA_CHANGE_COOKIE);
    const secret = begin.json.secret as string;
    const confirm = await call("POST", [first, grant], { action: "confirm", code: code(secret) });
    assert.equal(confirm.status, 200, show(confirm));
    assert.equal((confirm.json.recoveryCodes as string[]).length, 10);
    const second = issued(confirm);
    assert.ok(second);
    assert.equal((await call("GET", [first])).status, 401, "unverified session ends when 2FA turns on");
    assert.equal((await call("GET", [second])).json.enabled, true, "the reissued session is mfaVerified");

    mock.timers.tick(30_000);
    const disable = await call("POST", [second], { action: "disable", password: PASSWORD, code: code(secret) });
    assert.equal(disable.status, 200, show(disable));
    assert.equal(disable.cacheControl, "no-store");
    assert.equal(disable.json.success, true);
    assert.equal(disable.json.recoveryCodes, undefined);
    const third = issued(disable);
    assert.ok(third);
    assert.equal((await call("GET", [second])).status, 401);
    const off = await call("GET", [third]);
    assert.equal(off.status, 200, show(off));
    assert.equal(off.json.enabled, false);
    assert.equal(row(id).mfaEnabled, false);
  });

  it("cancel clears the pending change and the grant cookie; regenerate returns codes without a reissue", async () => {
    const id = "route-cancel";
    const old = seedEnrolled(id);
    const session = await sessionFor(id, true);
    const begin = await call("POST", [session], { action: "begin", mode: "change", password: PASSWORD, code: code(old.secret) });
    const cancel = await call("POST", [session, cookieValue(begin, MFA_CHANGE_COOKIE)], { action: "cancel" });
    assert.equal(cancel.status, 200, show(cancel));
    assert.deepEqual(cancel.json, { success: true });
    assert.match(cancel.setCookies.find(cookie => cookie.startsWith(`${MFA_CHANGE_COOKIE}=`))!, /Max-Age=0/);
    assert.equal(row(id).mfaPendingSecret, null);
    assert.equal((await call("POST", [session], { action: "cancel" })).json.reason, "setup_expired");

    mock.timers.tick(30_000);
    const regenerate = await call("POST", [session], { action: "regenerate", password: PASSWORD, code: code(old.secret) });
    assert.equal(regenerate.status, 200, show(regenerate));
    assert.deepEqual(Object.keys(regenerate.json), ["recoveryCodes"]);
    assert.equal(regenerate.cacheControl, "no-store");
    assert.equal(issued(regenerate), "");
    assert.equal((await call("GET", [session])).status, 200, "regenerate leaves the session alone");
  });

  it("reason codes: password_invalid, mfa_required, invalid_request; 403 cross-origin; 429 after 10 POSTs", async () => {
    const id = "route-reasons";
    const old = seedEnrolled(id);
    const session = await sessionFor(id, true);
    const expectations: [unknown, number, string][] = [
      [{ action: "begin", mode: "change", password: "wrong", code: code(old.secret) }, 400, "password_invalid"],
      [{ action: "disable", password: PASSWORD, code: code(old.secret) }, 403, "mfa_required"],
      [{ action: "begin", mode: "sideways", password: PASSWORD }, 400, "invalid_request"],
      [{ action: "nope" }, 400, "invalid_request"],
    ];
    for (const [body, status, reason] of expectations) {
      const result = await call("POST", [session], body);
      assert.equal(result.status, status, show(result));
      assert.equal(result.json.reason, reason);
      assert.equal(result.cacheControl, "no-store");
      assert.equal(typeof result.json.error, "string");
    }
    const crossSite = await call("POST", [session], { action: "cancel" }, "https://evil.example");
    assert.equal(crossSite.status, 403, show(crossSite));
    assert.equal(crossSite.json.reason, "invalid_request");
    assert.equal(crossSite.cacheControl, "no-store");

    const limited = "route-rate";
    seedEnrolled(limited);
    const limitedSession = await sessionFor(limited, true);
    const statuses: number[] = [];
    let last: Result | undefined;
    for (let attempt = 0; attempt < 11; attempt++) {
      last = await call("POST", [limitedSession], { action: "cancel" });
      statuses.push(last.status);
    }
    assert.ok(statuses.slice(0, 10).every(status => status !== 429), statuses.join(","));
    assert.equal(last!.status, 429, show(last!));
    assert.equal(last!.json.reason, "rate_limited");
    assert.equal(last!.cacheControl, "no-store");
  });

  it("logs carry the reason only", () => {
    assert.ok(logs.some(line => line.includes("[account/mfa]") && line.includes("password_invalid")));
    for (const line of logs) assert.ok(!/\b\d{6}\b/.test(line) || !line.includes("[account/mfa]"), `a 6-digit value reached a manage log line: ${line.slice(0, 120)}`);
  });
});
