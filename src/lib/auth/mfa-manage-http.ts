import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { ApiError } from "@/lib/api/scope";
import type { AuthUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { issueSession } from "@/lib/auth/issue-session";
import { SESSION_COOKIE_NAME, SESSION_DAYS, hashSessionToken } from "@/lib/auth/session-cookie";
import { MfaFailure, NO_STORE, failureResponse } from "@/lib/auth/mfa-failure";
import { MFA_CHANGE_COOKIE, mfaChangeCookieAttributes, readChangeGrant, signChangeGrant } from "@/lib/auth/mfa-change-grant";
import { beginChange, cancelChange, confirmChange, disableMfa, mfaStatus, regenerateCodes, type MfaManageDeps } from "@/lib/auth/mfa-manage";

/**
 * HTTP adapter for GET/POST /api/account/mfa (design §B.2.6). The route file
 * only binds `requireUser` to `requireAuthUser()`; tests inject a stand-in
 * because `requireAuthUser` needs Next's request store.
 *
 * Everything after authentication runs inside ONE explicit tenant context:
 * confirm/disable bump `accessVersion` and revoke sessions mid-request, after
 * which the guard's request-cookie fallback would no longer resolve a tenant.
 */
export type ManageHttpDeps = { requireUser: (req: NextRequest) => Promise<AuthUser> };

const LOG_TAG = "[account/mfa]";
const password = z.string().min(1).max(200);
const code = z.string().max(64);
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin"), mode: z.enum(["change", "enable"]), password, code: code.optional(), recovery: z.boolean().optional() }),
  z.object({ action: z.literal("confirm"), code }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("regenerate"), password, code }),
  z.object({ action: z.literal("disable"), password, code, recovery: z.boolean().optional() }),
]);

const coreDeps = (): MfaManageDeps => ({ db: prisma, now: () => new Date(), compare: bcrypt.compare });

/** A revoked/missing session is `session_expired`; other status-carrying errors keep their status. */
function normalize(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return new MfaFailure("session_expired", undefined, error.message, 401);
  if (!(error instanceof MfaFailure) && !(error instanceof ApiError) && error instanceof Error && "status" in error && typeof error.status === "number") {
    return new MfaFailure("invalid_request", undefined, error.message, error.status);
  }
  return error;
}

/** `action` is read lazily: POST only knows it once the body is parsed. */
async function withAccount(req: NextRequest, deps: ManageHttpDeps, action: () => unknown, run: (user: User) => Promise<Response>) {
  let user: User | undefined;
  try {
    const principal = await deps.requireUser(req);
    return await runWithTenantContext(
      { schoolId: principal.schoolId, userId: principal.userId, campusId: principal.campusId, role: principal.role },
      async () => {
        try {
          user = (await prisma.user.findFirst({ where: { id: principal.userId, schoolId: principal.schoolId, isActive: true } })) ?? undefined;
          if (!user) throw new MfaFailure("session_expired");
          return await run(user);
        } catch (error) {
          return failureResponse(normalize(error), user, action(), LOG_TAG);
        }
      },
    );
  } catch (error) {
    return failureResponse(normalize(error), user, action(), LOG_TAG);
  }
}

function noStore<T extends Response>(response: T) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function readGrant(req: NextRequest) {
  return readChangeGrant(req.cookies.get(MFA_CHANGE_COOKIE)?.value || "").catch(() => { throw new MfaFailure("setup_expired"); });
}

/** Keeps the current session's length (7 or 30 days) across the reissue. */
async function currentSessionDays(req: NextRequest, user: User) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return SESSION_DAYS.default;
  const row = await prisma.loginSession.findFirst({ where: { tokenHash: hashSessionToken(token), userId: user.id, schoolId: user.schoolId }, select: { loginAt: true, expiresAt: true } });
  return row && row.expiresAt.getTime() - row.loginAt.getTime() > 8 * 86400_000 ? SESSION_DAYS.remembered : SESSION_DAYS.default;
}

/** Reissues this device's session after confirm/disable revoked every session. Runs inside the explicit tenant context. */
async function reissue(req: NextRequest, before: User, after: User, body?: Record<string, unknown>) {
  const days = await currentSessionDays(req, before);
  return noStore(await issueSession(after, days, after.mfaEnabled, req, { reason: "mfa-change", body }));
}

function clearGrant(response: NextResponse) {
  response.cookies.set(MFA_CHANGE_COOKIE, "", mfaChangeCookieAttributes(0));
  return response;
}

export async function manageStatus(req: NextRequest, deps: ManageHttpDeps) {
  return withAccount(req, deps, () => "status", async user => NextResponse.json(mfaStatus(user), { headers: NO_STORE }));
}

export async function manageMutation(req: NextRequest, deps: ManageHttpDeps) {
  let action: unknown;
  try {
    assertSameOrigin(req);
  } catch (error) {
    return failureResponse(error, undefined, null, LOG_TAG);
  }
  return withAccount(req, deps, () => action, async user => {
    if (!(await authRateLimit(`mfa-manage:${user.id}`, { limit: 10, windowMs: 300_000 })).ok) throw new MfaFailure("rate_limited");
    const raw = await req.json().catch(() => ({}));
    action = (raw as { action?: unknown })?.action;
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw new MfaFailure("invalid_request", undefined, "That request wasn't valid. Reload and try again.");
    const body = parsed.data;
    const core = coreDeps();
    switch (body.action) {
      case "begin": {
        const started = await beginChange(user, body, core);
        const grant = await signChangeGrant({ userId: user.id, schoolId: user.schoolId, accessVersion: user.accessVersion, nonce: started.nonce, mode: started.mode });
        const response = NextResponse.json({ secret: started.secret, uri: started.uri, expiresAt: started.expiresAt.toISOString() }, { headers: NO_STORE });
        response.cookies.set(MFA_CHANGE_COOKIE, grant, mfaChangeCookieAttributes());
        return response;
      }
      case "confirm": {
        const grant = await readGrant(req);
        const result = await confirmChange(user, grant, body.code, core);
        return clearGrant(await reissue(req, user, result.user, { recoveryCodes: result.recoveryCodes }));
      }
      case "cancel": {
        const grant = await readGrant(req);
        await cancelChange(user, grant, core);
        return clearGrant(NextResponse.json({ success: true }, { headers: NO_STORE }));
      }
      case "regenerate": {
        const result = await regenerateCodes(user, body, core);
        return NextResponse.json({ recoveryCodes: result.recoveryCodes }, { headers: NO_STORE });
      }
      case "disable": {
        const result = await disableMfa(user, body, core);
        return reissue(req, user, result.user);
      }
    }
  });
}
