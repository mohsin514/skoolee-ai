'use server';

import { getAuthUser, type AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { AccessDenied } from "@/lib/auth/policy";
import { JWT_SECRET } from "@/lib/auth/secret";
import { rotateLoginSession } from "@/lib/audit";
import {
  SESSION_COOKIE_NAME,
  SESSION_DAYS,
  sessionCookieAttributes,
} from "@/lib/auth/session-cookie";
import {
  SetupCompletionError,
  SetupConflictError,
  SetupValidationError,
  assignSetupDelegate,
  completeSetup,
  resolveSetupActor,
  revokeSetupDelegate,
  saveSetup,
  setupTenantContext,
  setupView,
  type DelegateInput,
  type SaveSetupInput,
  type SetupView,
} from "@/lib/onboarding/setup-service";
import type { SetupStepId, StepErrors } from "@/lib/onboarding/setup-state";

// Server actions return structured results: thrown messages are redacted in
// production, and the wizard needs the exact step and field that failed.
export type SetupActionResult =
  | { ok: true; view: SetupView }
  | { ok: false; message: string; errors?: StepErrors; failedStep?: SetupStepId; view?: SetupView; denied?: boolean };

async function currentActor() {
  const payload = await getAuthUser();
  if (!payload) throw new AccessDenied("institution", "setup");
  return payload;
}

/** Binds the institution-wide setup scope for the whole call (enterWith does not survive server-action awaits). */
const scoped = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext(setupTenantContext(user), fn);

async function latestView(user: AuthUser) {
  try { return await scoped(user, async () => setupView(await resolveSetupActor(user))); } catch { return undefined; }
}

async function failure(error: unknown, user?: AuthUser): Promise<SetupActionResult> {
  if (error instanceof SetupValidationError) return { ok: false, message: error.message, errors: error.errors };
  if (error instanceof SetupConflictError) return { ok: false, message: error.message, view: user ? await latestView(user) : undefined };
  if (error instanceof SetupCompletionError) return { ok: false, message: error.message, failedStep: error.failedStep, view: user ? await latestView(user) : undefined };
  if (error instanceof AccessDenied) return { ok: false, denied: true, message: "Only the institution creator or a named setup delegate can change this setup." };
  console.error("[onboarding] action failed", error);
  return { ok: false, message: "Your setup could not be saved. Your last saved progress is unchanged; try again." };
}

export async function getOnboardingSession(): Promise<
  | { view: SetupView }
  | { redirect: true; role: string }
  | { noAccess: true; role: string }
  | { signedOut: true }
  | { error: true }
> {
  // A revoked delegate or ended session has no principal: send them to sign in.
  const payload = await getAuthUser();
  if (!payload) return { signedOut: true };
  if (payload.onboardingComplete) return { redirect: true, role: payload.role };
  try {
    return { view: await scoped(payload, async () => setupView(await resolveSetupActor(payload))) };
  } catch (error) {
    if (error instanceof AccessDenied) return { noAccess: true, role: payload.role };
    console.error("[onboarding] session failed", error);
    return { error: true };
  }
}

export async function saveOnboardingStep(input: SaveSetupInput): Promise<SetupActionResult> {
  let user: AuthUser | undefined;
  try {
    const actor = user = await currentActor();
    return { ok: true, view: await scoped(actor, () => saveSetup(actor, input)) };
  } catch (error) {
    return failure(error, user);
  }
}

export async function finishOnboarding(expectedVersion: number): Promise<
  | { success: true; role: string; replayed: boolean; activated: number; drafts: number; institutionType: string }
  | { success: false; message: string; errors?: StepErrors; failedStep?: SetupStepId; view?: SetupView; denied?: boolean }
> {
  let payload: AuthUser | undefined;
  try {
    const actor = payload = await currentActor();
    const result = await scoped(actor, () => completeSetup(actor, expectedVersion));
    const role = await scoped(actor, () => reissueSession(actor));
    return { success: true, role, replayed: result.replayed, activated: result.activatedCampusIds.length, drafts: result.draftCampusKeys.length, institutionType: result.institutionType };
  } catch (error) {
    const result = await failure(error, payload);
    if (result.ok) throw new Error("unreachable");
    return { success: false, ...result };
  }
}

/** The completed account gets a fresh session carrying its new campus, role and onboarding state. */
async function reissueSession(payload: AuthUser) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const updatedUser = await prisma.user.findFirstOrThrow({
    where: { id: payload.userId, schoolId: payload.schoolId },
    include: { school: true },
  });

  const newToken = await new SignJWT({
    mfaVerified: payload.mfaVerified === true,
    userId: updatedUser.id,
    accessVersion: updatedUser.accessVersion,
    email: updatedUser.email,
    fullName: updatedUser.fullName,
    role: updatedUser.role,
    schoolId: updatedUser.schoolId,
    campusId: updatedUser.campusId,
    schoolSlug: updatedUser.school?.slug,
    schoolStatus: updatedUser.school?.status,
    onboardingComplete: updatedUser.onboardingComplete,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  // Close the row for the token being replaced and record one for its
  // successor, so this session stays revocable across the re-mint.
  await rotateLoginSession({
    previousToken: token,
    token: newToken,
    userId: updatedUser.id,
    schoolId: updatedUser.schoolId,
    expiresAt: new Date(Date.now() + SESSION_DAYS.default * 24 * 60 * 60 * 1000),
  });
  cookieStore.set(SESSION_COOKIE_NAME, newToken, sessionCookieAttributes(SESSION_DAYS.default));
  return updatedUser.role;
}

export async function assignOnboardingDelegate(input: DelegateInput): Promise<
  | { ok: true; view: SetupView; temporaryPassword: string; email: string }
  | { ok: false; message: string; errors?: StepErrors; denied?: boolean }
> {
  let user: AuthUser | undefined;
  try {
    const actor = user = await currentActor();
    const created = await scoped(actor, () => assignSetupDelegate(actor, input));
    return { ok: true, view: await scoped(actor, async () => setupView(await resolveSetupActor(actor))), temporaryPassword: created.temporaryPassword, email: created.email };
  } catch (error) {
    const result = await failure(error, user);
    return result.ok ? { ok: false, message: "unreachable" } : result;
  }
}

export async function revokeOnboardingDelegate(): Promise<SetupActionResult> {
  let user: AuthUser | undefined;
  try {
    const actor = user = await currentActor();
    await scoped(actor, () => revokeSetupDelegate(actor));
    return { ok: true, view: await scoped(actor, async () => setupView(await resolveSetupActor(actor))) };
  } catch (error) {
    return failure(error, user);
  }
}
