import { randomUUID } from "node:crypto";
import type bcrypt from "bcryptjs";
import type { Prisma, User } from "@prisma/client";
import type { prisma } from "@/lib/db/prisma";
import {
  MfaSecretUnavailableError, checkTotp, looksLikeRecoveryCode, newAuthenticatorSecret, newRecoveryCodes, normalizeMfaCode, protectSecret, recoveryHash, requiresMfa, revealSecret,
} from "@/lib/auth/mfa-crypto";
import { MfaFailure, TOTP_REASONS, audit, reveal } from "@/lib/auth/mfa-failure";
import type { ChangeGrant, MfaChangeMode } from "@/lib/auth/mfa-change-grant";

/**
 * Settings → Security: change the authenticator in place, regenerate recovery
 * codes, turn 2FA on or off (design §B.2.5).
 *
 * Pure and injectable: every DB access goes through `deps.db`, the clock is
 * `deps.now()` and password checks are `deps.compare`, so the whole flow is
 * driven in tests without a database. The route (/api/account/mfa) is a thin
 * adapter that owns the session, cookies and tenant context.
 *
 * Invariants owned here:
 * - the password is checked before any code, so wrong-password probing never
 *   consumes a recovery code or advances `mfaLastStep`;
 * - every write is one guarded `updateMany` keyed on the exact values read
 *   (`accessVersion`, `mfaEnabled`, and the consumed factor), `count !== 1`
 *   → `state_changed`;
 * - `mfaEnabled` never goes false during a change: the new secret is staged in
 *   the `mfaPending*` columns and swapped in by a single write at confirm;
 * - mandatory roles can't turn 2FA off (same `requiresMfa` as login/principal).
 */
type Db = Pick<typeof prisma, "user" | "loginSession" | "auditLog" | "$transaction">;
export type MfaManageDeps = { db: Db; now: () => Date; compare: typeof bcrypt.compare };
export type ReauthInput = { password: string; code?: string; recovery?: boolean };
export type MfaStatus = {
  enabled: boolean;
  required: boolean;
  enrolledAt: string | null;
  recoveryCodesRemaining: number;
  recoveryCodesTotal: number;
  /** null when 2FA is off; false when the stored secret can't be decrypted on this deployment. */
  authenticatorReadable: boolean | null;
};

const PENDING_TTL_MS = 600_000;
const RECOVERY_CODES_TOTAL = 10;
const PENDING_CLEARED = { mfaPendingSecret: null, mfaPendingTicket: null, mfaPendingExpiresAt: null, mfaPendingVerified: false } as const;

/** Status for the Settings page. Contains no secret, code or hash. */
export function mfaStatus(user: User): MfaStatus {
  let authenticatorReadable: boolean | null = null;
  if (user.mfaEnabled) {
    try {
      revealSecret(user.mfaSecret ?? "");
      authenticatorReadable = true;
    } catch (error) {
      if (!(error instanceof MfaSecretUnavailableError)) throw error;
      authenticatorReadable = false;
    }
  }
  return {
    enabled: user.mfaEnabled,
    required: requiresMfa(user),
    enrolledAt: user.mfaEnrolledAt?.toISOString() ?? null,
    recoveryCodesRemaining: user.recoveryCodeHashes.length,
    recoveryCodesTotal: RECOVERY_CODES_TOTAL,
    authenticatorReadable,
  };
}

export function otpauthUri(email: string, secret: string) {
  return `otpauth://totp/${encodeURIComponent(`Skoolee:${email}`)}?secret=${secret}&issuer=Skoolee&algorithm=SHA1&digits=6&period=30`;
}

/** Audited failures write `{ action, reason }` through the injected client; the route only logs. */
async function auditingFailures<T>(user: User, deps: MfaManageDeps, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MfaFailure && error.auditAction) {
      await audit(deps.db, user, error.auditAction, error.reason).catch(auditError => console.error("[account/mfa] audit write failed", auditError));
    }
    throw error;
  }
}

type Reauth = { consume: Prisma.UserUpdateManyMutationInput; guard: Prisma.UserWhereInput };

/** Password first, then (when 2FA is on) a current TOTP or an unused recovery code. Nothing is written here. */
async function reauth(user: User, input: ReauthInput, options: { allowRecovery: boolean; requireCode: boolean; failAction: string }, deps: MfaManageDeps): Promise<Reauth> {
  if (!user.password || !(await deps.compare(input.password, user.password))) throw new MfaFailure("password_invalid", options.failAction);
  if (!options.requireCode) return { consume: {}, guard: {} };
  const code = normalizeMfaCode(input.code);
  if (options.allowRecovery && (input.recovery === true || looksLikeRecoveryCode(code))) {
    const hash = recoveryHash(code);
    if (!user.recoveryCodeHashes.includes(hash)) throw new MfaFailure("recovery_invalid", options.failAction);
    return { consume: { recoveryCodeHashes: user.recoveryCodeHashes.filter(value => value !== hash) }, guard: { recoveryCodeHashes: { equals: user.recoveryCodeHashes } } };
  }
  const check = checkTotp(reveal(user.mfaSecret ?? ""), code, user.mfaLastStep, deps.now().getTime());
  if (!check.ok) throw new MfaFailure(TOTP_REASONS[check.reason], options.failAction);
  return { consume: { mfaLastStep: check.step }, guard: { mfaLastStep: user.mfaLastStep } };
}

/** The row exactly as read: any concurrent security change makes the write match nothing. */
function asRead(user: User, guard: Prisma.UserWhereInput = {}): Prisma.UserWhereInput {
  return { id: user.id, schoolId: user.schoolId, accessVersion: user.accessVersion, mfaEnabled: user.mfaEnabled, ...guard };
}

async function reread(user: User, deps: MfaManageDeps) {
  const current = await deps.db.user.findFirst({ where: { id: user.id, schoolId: user.schoolId } });
  if (!current) throw new MfaFailure("state_changed");
  return current;
}

/**
 * Re-authenticates and stages a new authenticator secret. The current secret,
 * `mfaLastStep` and recovery codes stay live until `confirmChange`.
 * `change`: 2FA on, password + current code. `enable`: optional user with 2FA off, password only.
 */
export async function beginChange(user: User, input: ReauthInput & { mode: MfaChangeMode }, deps: MfaManageDeps) {
  const failAction = input.mode === "change" ? "mfa.change.failed" : "mfa.enable.failed";
  return auditingFailures(user, deps, async () => {
    if (input.mode === "change" ? !user.mfaEnabled : user.mfaEnabled || requiresMfa(user)) throw new MfaFailure("invalid_request");
    const { consume, guard } = await reauth(user, input, { allowRecovery: true, requireCode: input.mode === "change", failAction }, deps);
    const secret = newAuthenticatorSecret();
    const nonce = randomUUID();
    const expiresAt = new Date(deps.now().getTime() + PENDING_TTL_MS);
    const staged = await deps.db.user.updateMany({
      where: asRead(user, guard),
      data: { ...consume, mfaPendingSecret: protectSecret(secret), mfaPendingTicket: nonce, mfaPendingExpiresAt: expiresAt, mfaPendingVerified: false },
    });
    if (staged.count !== 1) throw new MfaFailure("state_changed");
    await audit(deps.db, user, input.mode === "change" ? "mfa.change.started" : "mfa.enable.started");
    return { secret, uri: otpauthUri(user.email, secret), nonce, expiresAt, mode: input.mode };
  });
}

/**
 * Verifies a code from the new app and swaps it in with one guarded write:
 * secret, replay floor, fresh recovery codes, enrolment date, pending cleared,
 * `accessVersion` bumped. Every session is revoked in the same transaction;
 * the route reissues the current one.
 */
export async function confirmChange(user: User, grant: ChangeGrant, code: string, deps: MfaManageDeps) {
  const failAction = grant.mode === "change" ? "mfa.change.failed" : "mfa.enable.failed";
  return auditingFailures(user, deps, async () => {
    const now = deps.now();
    if (grant.userId !== user.id || grant.schoolId !== user.schoolId || grant.accessVersion !== user.accessVersion) throw new MfaFailure("state_changed");
    if (user.mfaPendingTicket !== grant.nonce || !user.mfaPendingSecret || !user.mfaPendingExpiresAt || user.mfaPendingExpiresAt <= now) throw new MfaFailure("setup_expired");
    if (user.mfaEnabled !== (grant.mode === "change")) throw new MfaFailure("state_changed");
    // lastStep -1: a different key, so the step used at re-auth is not a replay here.
    const check = checkTotp(reveal(user.mfaPendingSecret), normalizeMfaCode(code), -1, now.getTime());
    if (!check.ok) throw new MfaFailure(TOTP_REASONS[check.reason], failAction);
    const recoveryCodes = newRecoveryCodes();
    await deps.db.$transaction(async tx => {
      const swapped = await tx.user.updateMany({
        where: { ...asRead(user), mfaPendingTicket: grant.nonce, mfaPendingSecret: user.mfaPendingSecret, mfaPendingExpiresAt: { gt: now }, mfaLastStep: user.mfaLastStep },
        data: {
          mfaEnabled: true, mfaSecret: user.mfaPendingSecret,
          // Monotonic replay floor across the swap.
          mfaLastStep: Math.max(user.mfaLastStep, check.step),
          recoveryCodeHashes: recoveryCodes.map(recoveryHash), mfaEnrolledAt: now, ...PENDING_CLEARED, accessVersion: { increment: 1 },
        },
      });
      if (swapped.count !== 1) throw new MfaFailure("state_changed");
      await tx.loginSession.updateMany({ where: { userId: user.id, schoolId: user.schoolId }, data: { isActive: false, logoutAt: now } });
      await audit(tx, user, grant.mode === "change" ? "mfa.authenticator.changed" : "mfa.enabled");
    });
    return { user: await reread(user, deps), recoveryCodes };
  });
}

/** Drops the staged secret this grant created. Idempotent: nothing to clear is fine. */
export async function cancelChange(user: User, grant: ChangeGrant, deps: MfaManageDeps) {
  if (grant.userId !== user.id || grant.schoolId !== user.schoolId) return;
  await deps.db.user.updateMany({ where: { id: user.id, schoolId: user.schoolId, mfaPendingTicket: grant.nonce }, data: { ...PENDING_CLEARED } });
}

/** Password + current authenticator code (not a recovery code). Old codes stop working in the same write. */
export async function regenerateCodes(user: User, input: ReauthInput, deps: MfaManageDeps) {
  const failAction = "mfa.regenerate.failed";
  return auditingFailures(user, deps, async () => {
    if (!user.mfaEnabled) throw new MfaFailure("invalid_request");
    const { consume, guard } = await reauth(user, input, { allowRecovery: false, requireCode: true, failAction }, deps);
    const recoveryCodes = newRecoveryCodes();
    const replaced = await deps.db.user.updateMany({ where: asRead(user, guard), data: { ...consume, recoveryCodeHashes: recoveryCodes.map(recoveryHash) } });
    if (replaced.count !== 1) throw new MfaFailure("state_changed");
    await audit(deps.db, user, "mfa.recovery.regenerated");
    return { recoveryCodes };
  });
}

/** Optional roles only. Password + a current code or unused recovery code; revokes every session. */
export async function disableMfa(user: User, input: ReauthInput, deps: MfaManageDeps) {
  const failAction = "mfa.disable.failed";
  return auditingFailures(user, deps, async () => {
    if (requiresMfa(user)) throw new MfaFailure("mfa_required", "mfa.disable.refused");
    if (!user.mfaEnabled) throw new MfaFailure("invalid_request");
    const { consume, guard } = await reauth(user, input, { allowRecovery: true, requireCode: true, failAction }, deps);
    const now = deps.now();
    await deps.db.$transaction(async tx => {
      const disabled = await tx.user.updateMany({
        where: { ...asRead(user, guard), mfaEnabled: true },
        // disableData last so it wins over the reauth `consume`.
        data: { ...consume, mfaEnabled: false, mfaSecret: null, mfaLastStep: -1, recoveryCodeHashes: [], mfaEnrolledAt: null, ...PENDING_CLEARED, accessVersion: { increment: 1 } },
      });
      if (disabled.count !== 1) throw new MfaFailure("state_changed");
      await tx.loginSession.updateMany({ where: { userId: user.id, schoolId: user.schoolId }, data: { isActive: false, logoutAt: now } });
      await audit(tx, user, "mfa.disabled");
    });
    return { user: await reread(user, deps) };
  });
}
