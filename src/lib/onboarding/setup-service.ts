// ─────────────────────────────────────────────────────────────────
// Durable institution setup (SKO-391).
//
// Every read and write goes through resolveSetupActor(): only the verified
// institution creator, or a setup delegate the creator named explicitly,
// may see or change the setup. Saves are versioned so a stale tab or a
// revoked delegate cannot overwrite newer work, and completion runs in one
// transaction that is safe to retry — a retry after a partial failure or a
// duplicate click never creates a second campus or academic cycle.
// ─────────────────────────────────────────────────────────────────
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, tenantTransaction, type TxClient } from "@/lib/db/prisma";
import { AccessDenied } from "@/lib/auth/policy";
import type { AuthUser } from "@/lib/auth";
import { normalizePlan } from "@/config/plans";
import { getSchoolPlanContract } from "@/config/commercial-contract";
import { DEFAULT_EXAM_BOARD } from "@/config/boards";
import { parseDateOnly, parseLogo, safeTimezone } from "@/lib/school/details";
import {
  ADOPTION_MODES,
  INSTITUTION_TYPES,
  campusesForCompletion,
  completedAfterTypeChange,
  describeStepErrors,
  initialInstitutionType,
  isSetupStep,
  parseSetupDraft,
  resumeStep,
  setupFlow,
  splitByCapacity,
  validateStep,
  type AdoptionMode,
  type InstitutionType,
  type SetupDraft,
  type SetupStepId,
  type StepErrors,
} from "./setup-state";

const SETUP_ROLES = ["SUPER_ADMIN", "ADMIN"];

/**
 * Setup is institution-wide: a standalone owner has no campus until setup
 * creates one, so campus scoping cannot apply yet. Authority comes from
 * resolveSetupActor(), which every entry point calls first.
 */
export function setupTenantContext(user: AuthUser) {
  return { schoolId: user.schoolId, userId: user.userId, campusId: user.campusId, role: undefined, reason: "institution setup by its creator or named delegate" };
}

export class SetupConflictError extends Error {
  status = 409;
  constructor(message = "This setup was changed by another session. The latest saved version has been loaded.") {
    super(message);
  }
}

export class SetupValidationError extends Error {
  status = 400;
  constructor(public errors: StepErrors) {
    super(describeStepErrors(errors));
  }
}

export class SetupCompletionError extends Error {
  status = 409;
  constructor(message: string, public failedStep: SetupStepId) {
    super(message);
  }
}

type SetupRow = NonNullable<Awaited<ReturnType<typeof prisma.institutionSetup.findUnique>>>;
type SchoolRow = { id: string; name: string; city: string; contactEmail: string; phone: string | null; regId: string; plan: string; registrationKind: string; commercialContract: Prisma.JsonValue };

export interface SetupActor {
  kind: "owner" | "delegate";
  user: AuthUser;
  setup: SetupRow;
  school: SchoolRow;
}

const schoolSelect = { id: true, name: true, city: true, contactEmail: true, phone: true, regId: true, plan: true, registrationKind: true, commercialContract: true } as const;

function initialDraft(school: SchoolRow, ownerPhone: string | null): SetupDraft {
  const year = new Date().getFullYear();
  return parseSetupDraft({
    school: {
      name: school.name,
      city: school.city,
      email: school.contactEmail,
      phone: school.phone || ownerPhone || "",
      regId: school.regId,
      primaryCampusRegId: `BR-${randomBytes(3).toString("hex").slice(0, 4).toUpperCase()}`,
      timezone: "",
      academicYear: String(year),
      sessionLabel: `${year}-${String((year + 1) % 100).padStart(2, "0")}`,
      weekends: [7],
    },
    campuses: [],
  });
}

/** The setup row for this school, created on first visit from what registration already captured. */
async function ensureSetup(school: SchoolRow, user: AuthUser): Promise<SetupRow> {
  const existing = await prisma.institutionSetup.findUnique({ where: { schoolId: school.id } });
  if (existing) return existing;
  const owner = await prisma.user.findFirst({ where: { schoolId: school.id, isInstitutionOwner: true }, select: { role: true, phone: true } });
  try {
    return await prisma.institutionSetup.create({
      data: {
        schoolId: school.id,
        institutionType: initialInstitutionType(school.registrationKind, owner?.role ?? user.role),
        draft: initialDraft(school, owner?.phone ?? null) as Prisma.InputJsonValue,
        updatedById: user.userId,
      },
    });
  } catch (error) {
    // Two tabs opening setup at once: the loser reads the winner's row.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.institutionSetup.findUniqueOrThrow({ where: { schoolId: school.id } });
    }
    throw error;
  }
}

/**
 * Who may act on this setup. The creator is the account whose email
 * registered the school; anyone else needs an explicit, unrevoked setup
 * delegation. Invitees and every non-administrative role are refused.
 */
export async function resolveSetupActor(user: AuthUser): Promise<SetupActor> {
  if (!SETUP_ROLES.includes(user.role)) throw new AccessDenied("institution", "setup", user);
  const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: schoolSelect });
  if (!school) throw new AccessDenied("institution", "setup", user);
  const isCreator = Boolean(user.isInstitutionOwner) && school.contactEmail.toLowerCase() === user.email.toLowerCase();
  const existing = await prisma.institutionSetup.findUnique({ where: { schoolId: school.id } });
  if (!isCreator) {
    if (!existing || existing.delegateUserId !== user.userId) throw new AccessDenied("institution", "setup", user);
    return { kind: "delegate", user, setup: existing, school };
  }
  return { kind: "owner", user, setup: existing ?? (await ensureSetup(school, user)), school };
}

/** Creator, or a delegate the creator allowed to buy. Used by the package routes. */
export async function assertSetupPurchaser(user: AuthUser) {
  if (user.onboardingComplete) throw new AccessDenied("subscription", "purchase", user);
  const actor = await resolveSetupActor(user);
  if (actor.kind === "delegate" && !user.canPurchaseSubscription) throw new AccessDenied("subscription", "purchase", user);
  return actor;
}

function planFor(school: SchoolRow) {
  const plan = normalizePlan(school.plan);
  const contract = getSchoolPlanContract(plan, school.commercialContract);
  return { code: plan, name: contract.name, maxCampuses: contract.maxCampuses };
}

export async function setupView(actor: SetupActor) {
  const { setup, school, user } = actor;
  const [delegate, activeCampuses, me] = await Promise.all([
    setup.delegateUserId
      ? prisma.user.findFirst({ where: { id: setup.delegateUserId, schoolId: school.id }, select: { id: true, fullName: true, email: true, canPurchaseSubscription: true, mustChangePassword: true } })
      : Promise.resolve(null),
    prisma.campus.count({ where: { schoolId: school.id, archivedAt: null } }),
    prisma.user.findFirst({ where: { id: user.userId, schoolId: school.id }, select: { preferredLanguage: true, fullName: true } }),
  ]);
  const type = setup.institutionType as InstitutionType;
  return {
    id: setup.id,
    version: setup.version,
    institutionType: type,
    adoptionMode: (setup.adoptionMode as AdoptionMode | null) ?? null,
    flow: setupFlow(type),
    currentStep: resumeStep(setupFlow(type), setup.completedSteps, setup.currentStep),
    completedSteps: setup.completedSteps.filter(isSetupStep),
    draft: parseSetupDraft(setup.draft),
    status: setup.status,
    failedStep: setup.failedStep,
    lastError: setup.lastError,
    attempts: setup.attempts,
    result: setup.result as { activatedCampusIds?: string[]; draftCampusKeys?: string[] } | null,
    updatedAt: setup.updatedAt.toISOString(),
    actor: {
      kind: actor.kind,
      userId: user.userId,
      fullName: me?.fullName ?? user.fullName ?? "",
      canPurchase: actor.kind === "owner" || Boolean(user.canPurchaseSubscription),
      canDelegate: actor.kind === "owner",
    },
    delegate: delegate
      ? { fullName: delegate.fullName, email: delegate.email, canPurchaseSubscription: delegate.canPurchaseSubscription, pendingFirstSignIn: delegate.mustChangePassword }
      : null,
    plan: planFor(school),
    activeCampuses,
    contactEmail: school.contactEmail,
    language: me?.preferredLanguage || "en",
  };
}

export type SetupView = Awaited<ReturnType<typeof setupView>>;

export interface SaveSetupInput {
  expectedVersion: number;
  /** The step being saved. */
  step: SetupStepId;
  /** true when the person pressed Continue: the step must validate and is marked complete. */
  complete: boolean;
  /** Where to resume next (must be reachable). */
  nextStep?: SetupStepId;
  institutionType?: InstitutionType;
  adoptionMode?: AdoptionMode | null;
  draft?: unknown;
}

export async function saveSetup(user: AuthUser, input: SaveSetupInput) {
  const actor = await resolveSetupActor(user);
  const { setup } = actor;
  if (setup.status === "COMPLETED") throw new SetupConflictError("Setup is already complete.");
  if (setup.version !== input.expectedVersion) throw new SetupConflictError();
  if (!isSetupStep(input.step)) throw new SetupValidationError({ step: "step.invalid" });

  let type = setup.institutionType as InstitutionType;
  let completed = setup.completedSteps.filter(isSetupStep);
  if (input.institutionType && (INSTITUTION_TYPES as readonly string[]).includes(input.institutionType) && input.institutionType !== type) {
    type = input.institutionType;
    completed = completedAfterTypeChange(completed, type);
  }
  const adoptionMode = input.adoptionMode === undefined
    ? (setup.adoptionMode as AdoptionMode | null)
    : input.adoptionMode && (ADOPTION_MODES as readonly string[]).includes(input.adoptionMode) ? input.adoptionMode : null;
  const draft = input.draft === undefined ? parseSetupDraft(setup.draft) : parseSetupDraft(input.draft);
  const flow = setupFlow(type);

  if (input.complete) {
    if (!flow.includes(input.step)) throw new SetupValidationError({ step: "step.invalid" });
    const errors = validateStep(input.step, { institutionType: type, adoptionMode, draft });
    if (Object.keys(errors).length) throw new SetupValidationError(errors);
    if (!completed.includes(input.step)) completed = [...completed, input.step];
  }
  // A completed step stays completed only while its saved values still
  // validate, so "Save and exit" with a half-edited field re-opens just that
  // step instead of resuming past it. Review is always re-confirmed.
  completed = completed.filter((s) => s !== "review" && flow.includes(s) && Object.keys(validateStep(s, { institutionType: type, adoptionMode, draft })).length === 0);
  const defaultNext = input.complete ? flow[flow.indexOf(input.step) + 1] ?? input.step : input.step;
  const currentStep = resumeStep(flow, completed, setup.currentStep, input.nextStep ?? defaultNext);
  const clearsFailure = input.complete && setup.failedStep === input.step;

  const updated = await prisma.institutionSetup.updateMany({
    where: { schoolId: setup.schoolId, version: input.expectedVersion, status: { not: "COMPLETED" } },
    data: {
      institutionType: type,
      adoptionMode,
      draft: draft as Prisma.InputJsonValue,
      completedSteps: completed,
      currentStep,
      updatedById: user.userId,
      version: { increment: 1 },
      ...(setup.status === "FAILED" ? { status: "IN_PROGRESS" } : {}),
      ...(clearsFailure ? { failedStep: null, lastError: null } : {}),
    },
  });
  if (updated.count !== 1) throw new SetupConflictError();
  return setupView(await resolveSetupActor(user));
}

/** Test-only fault injection for partial-failure recovery checks. Never exposed to a request. */
export interface CompletionFaults { failAfterCampuses?: number }

export interface CompletionResult {
  replayed: boolean;
  institutionType: InstitutionType;
  activatedCampusIds: string[];
  draftCampusKeys: string[];
  primaryCampusId: string | null;
}

function friendlyCompletionError(error: unknown, type: InstitutionType, campusName: string | null): { message: string; step: SetupStepId } {
  const campusStep: SetupStepId = type === "GROUP" ? "campuses" : "identity";
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = JSON.stringify(error.meta?.target ?? "");
    if ((target.includes("reg_id") || target.includes("regId")) && !campusName) {
      return { message: "That School ID is already registered to another institution. Choose a different School ID and try again.", step: "identity" };
    }
    if (target.includes("reg_id") || target.includes("regId")) {
      return { message: `The Campus ID for ${campusName ?? "a campus"} is already registered to another institution. Choose a different Campus ID and try again.`, step: campusStep };
    }
  }
  if (error instanceof Error && /Injected setup fault/.test(error.message)) return { message: "Setup could not finish while creating campuses. Nothing was activated; your saved setup is unchanged.", step: campusStep };
  if (error instanceof Error && error.message) return { message: error.message, step: "review" };
  return { message: "Setup could not finish. Your saved setup is unchanged; try again.", step: "review" };
}

/**
 * Activates the saved setup. One transaction: either every eligible campus,
 * cycle, weekend and membership change lands, or none does. A repeat call
 * after success replays the stored result instead of writing again.
 */
export async function completeSetup(user: AuthUser, expectedVersion: number, faults: CompletionFaults = {}): Promise<CompletionResult> {
  const actor = await resolveSetupActor(user);
  const { setup, school } = actor;
  const type = setup.institutionType as InstitutionType;
  if (setup.status === "COMPLETED") return replay(setup, type);
  if (setup.version !== expectedVersion) throw new SetupConflictError();

  const draft = parseSetupDraft(setup.draft);
  const adoptionMode = setup.adoptionMode as AdoptionMode | null;
  const errors = validateStep("review", { institutionType: type, adoptionMode, draft });
  if (Object.keys(errors).length) throw new SetupValidationError(errors);

  let creating: string | null = null;
  try {
    return await tenantTransaction(async (tx) => {
      // Claim the setup. A concurrent completion blocks on this row and then
      // finds the version moved on, so only one transaction ever writes.
      const claim = await tx.institutionSetup.updateMany({
        where: { schoolId: school.id, version: expectedVersion, status: { in: ["IN_PROGRESS", "FAILED"] } },
        data: { status: "COMPLETING", attempts: { increment: 1 } },
      });
      if (claim.count !== 1) {
        const latest = await tx.institutionSetup.findUnique({ where: { schoolId: school.id } });
        if (latest?.status === "COMPLETED") return replay(latest, type);
        throw new SetupConflictError();
      }

      // Recheck the package now, not when the review page was rendered.
      const current = await tx.school.findUniqueOrThrow({ where: { id: school.id }, select: schoolSelect });
      const plan = planFor(current);
      const planned = campusesForCompletion(type, draft);
      const existing = await tx.campus.findMany({ where: { schoolId: school.id }, select: { id: true, regId: true, archivedAt: true } });
      const byRegId = new Map(existing.map((c) => [c.regId.toUpperCase(), c]));
      const plannedExisting = planned.filter((c) => byRegId.has(c.regId.trim().toUpperCase())).length;
      const otherActive = existing.filter((c) => !c.archivedAt).length - plannedExisting;
      const { activate, drafts } = splitByCapacity(planned, plan.maxCampuses, Math.max(0, otherActive));
      if (activate.length === 0) throw new SetupCompletionError(`Your ${plan.name} package has no campus capacity left. Change package to activate a campus.`, "package");

      const s = draft.school;
      await tx.school.update({
        where: { id: school.id },
        data: {
          name: s.name.trim(),
          city: s.city.trim(),
          address: s.address.trim() || null,
          regId: type === "GROUP" ? s.regId.trim() : current.regId,
          phone: s.phone.trim() || null,
          website: s.website.trim() || null,
          logoUrl: parseLogo(s.logoUrl || null),
          establishedYear: s.establishedYear ? Number(s.establishedYear) : null,
          tagline: s.tagline.trim() || null,
          registrationKind: type,
          ...(safeTimezone(s.timezone) ? { timezone: safeTimezone(s.timezone)! } : {}),
        },
      });

      const academicYear = Number(s.academicYear);
      const sessionStart = parseDateOnly(s.sessionStart);
      const sessionEnd = parseDateOnly(s.sessionEnd);
      const weekendDays = [...new Set(s.weekends)].filter((d) => d >= 1 && d <= 7);
      const activatedCampusIds: string[] = [];

      for (const [index, c] of activate.entries()) {
        creating = c.name;
        const regId = c.regId.trim().toUpperCase();
        // Reuse a campus an earlier, pre-transactional attempt already made
        // for this school rather than failing or duplicating it.
        const found = byRegId.get(regId);
        const campus = found
          ? await tx.campus.update({ where: { id: found.id }, data: { archivedAt: null } })
          : await tx.campus.create({
              data: {
                schoolId: school.id,
                name: c.name.trim(),
                city: c.city.trim(),
                address: c.address.trim() || null,
                phone: c.phone.trim() || null,
                email: c.email.trim() || null,
                website: c.website.trim() || null,
                principalName: c.principalName.trim() || null,
                regId,
                board: c.board || DEFAULT_EXAM_BOARD,
              },
            });
        activatedCampusIds.push(campus.id);

        // Every campus starts with a live session and a weekend: without an
        // ACTIVE cycle marks are filed under the calendar year, and without
        // weekend rows exams can be booked on a closed day.
        await tx.academicCycle.upsert({
          where: { campusId_academicYear: { campusId: campus.id, academicYear } },
          create: { schoolId: school.id, campusId: campus.id, label: s.sessionLabel.trim(), academicYear, status: "ACTIVE", startDate: sessionStart ?? new Date(), endDate: sessionEnd },
          update: {},
        });
        if (weekendDays.length) {
          await tx.weekend.createMany({ data: weekendDays.map((dayOfWeek) => ({ schoolId: school.id, campusId: campus.id, dayOfWeek })), skipDuplicates: true });
        }
        if (faults.failAfterCampuses && index + 1 >= faults.failAfterCampuses) throw new Error("Injected setup fault");
      }
      creating = null;

      // Membership: the creator owns the institution; a standalone owner
      // works inside its primary campus, a group owner across all campuses.
      const primaryCampusId = activatedCampusIds[0] ?? null;
      const ownerRole = type === "GROUP" ? "SUPER_ADMIN" : "ADMIN";
      const participants = [
        ...(await tx.user.findMany({ where: { schoolId: school.id, isInstitutionOwner: true }, select: { id: true, role: true } })).map((u) => u.id),
        ...(setup.delegateUserId ? [setup.delegateUserId] : []),
      ];
      for (const id of new Set(participants)) {
        const row = await tx.user.findFirst({ where: { id, schoolId: school.id }, select: { role: true, accessVersion: true } });
        if (!row || !SETUP_ROLES.includes(row.role)) continue;
        await tx.user.update({
          where: { id },
          data: {
            onboardingComplete: true,
            role: ownerRole,
            campusId: type === "GROUP" ? null : primaryCampusId,
            // A role change invalidates other open sessions; the actor is re-issued below.
            ...(row.role !== ownerRole ? { accessVersion: row.accessVersion + 1 } : {}),
          },
        });
      }

      const result = { activatedCampusIds, draftCampusKeys: drafts.map((c) => c.key), primaryCampusId };
      await tx.institutionSetup.update({
        where: { schoolId: school.id },
        data: { status: "COMPLETED", completedAt: new Date(), completedById: user.userId, result, lastError: null, failedStep: null, version: { increment: 1 }, currentStep: "review", completedSteps: setupFlow(type) },
      });
      await tx.auditLog.create({
        data: { schoolId: school.id, tableName: "institution_setup", recordId: setup.id, userId: user.userId, newValue: { action: "setup.completed", institutionType: type, adoptionMode, activated: activatedCampusIds.length, drafts: drafts.length, actor: actor.kind } },
      });
      return { replayed: false, institutionType: type, ...result };
    }, { timeout: 30_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof SetupConflictError) throw error;
    const failure = error instanceof SetupCompletionError ? { message: error.message, step: error.failedStep } : friendlyCompletionError(error, type, creating);
    if (!(error instanceof SetupCompletionError)) console.error("[setup] completion failed", error);
    // The transaction rolled back; record the failure so any authorised
    // person resumes at the failing step with every draft intact.
    await prisma.institutionSetup.updateMany({
      where: { schoolId: school.id, status: { not: "COMPLETED" } },
      data: { status: "FAILED", lastError: failure.message, failedStep: failure.step, attempts: { increment: 1 } },
    });
    throw new SetupCompletionError(failure.message, failure.step);
  }
}

function replay(setup: SetupRow, type: InstitutionType): CompletionResult {
  const result = (setup.result ?? {}) as { activatedCampusIds?: string[]; draftCampusKeys?: string[]; primaryCampusId?: string | null };
  return {
    replayed: true,
    institutionType: type,
    activatedCampusIds: result.activatedCampusIds ?? [],
    draftCampusKeys: result.draftCampusKeys ?? [],
    primaryCampusId: result.primaryCampusId ?? null,
  };
}

// ── Handover ─────────────────────────────────────────────────────

export interface DelegateInput { fullName: string; email: string; canPurchaseSubscription: boolean }

function temporaryPassword() {
  // Letters and digits so it satisfies the first-password rules once replaced.
  return `${randomBytes(9).toString("base64url")}7a`;
}

async function retireDelegate(tx: TxClient, schoolId: string, delegateUserId: string) {
  const row = await tx.user.findFirst({ where: { id: delegateUserId, schoolId }, select: { id: true, accessVersion: true, isInstitutionOwner: true } });
  if (!row || row.isInstitutionOwner) return;
  await tx.user.update({ where: { id: row.id }, data: { isActive: false, accessVersion: row.accessVersion + 1 } });
  await tx.loginSession.updateMany({ where: { userId: row.id }, data: { isActive: false, logoutAt: new Date() } });
}

/**
 * The creator hands the setup to a named colleague. The colleague gets an
 * administrative account limited to this setup: never the owner flag, never
 * membership management, and purchasing only if the creator ticks it.
 */
export async function assignSetupDelegate(user: AuthUser, input: DelegateInput) {
  const actor = await resolveSetupActor(user);
  if (actor.kind !== "owner") throw new AccessDenied("institution", "delegate", user);
  if (actor.setup.status === "COMPLETED") throw new SetupConflictError("Setup is already complete.");
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim().slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SetupValidationError({ delegateEmail: "email.invalid" });
  if (fullName.length < 2) throw new SetupValidationError({ delegateName: "name.required" });
  if (email === actor.school.contactEmail.toLowerCase()) throw new SetupValidationError({ delegateEmail: "delegate.self" });

  const password = temporaryPassword();
  const hash = await bcrypt.hash(password, 12);
  const role = actor.setup.institutionType === "GROUP" ? "SUPER_ADMIN" : "ADMIN";
  const schoolId = actor.school.id;
  const owner = await prisma.user.findFirst({ where: { id: user.userId, schoolId }, select: { preferredLanguage: true } });

  const delegate = await tenantTransaction(async (tx) => {
    if (actor.setup.delegateUserId) await retireDelegate(tx, schoolId, actor.setup.delegateUserId);
    const existing = await tx.user.findFirst({ where: { schoolId, email } });
    if (existing && (existing.isActive || existing.isInstitutionOwner || existing.onboardingComplete)) {
      throw new SetupValidationError({ delegateEmail: "delegate.exists" });
    }
    const data = {
      fullName,
      password: hash,
      role,
      isInstitutionOwner: false,
      canManageMemberships: false,
      canPurchaseSubscription: input.canPurchaseSubscription,
      onboardingComplete: false,
      mustChangePassword: true,
      isActive: true,
      preferredLanguage: owner?.preferredLanguage ?? null,
    } as const;
    const row = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { ...data, accessVersion: existing.accessVersion + 1 } })
      : await tx.user.create({ data: { ...data, email, schoolId } });
    await tx.institutionSetup.update({ where: { schoolId }, data: { delegateUserId: row.id, delegatedById: user.userId, delegatedAt: new Date() } });
    await tx.auditLog.create({ data: { schoolId, tableName: "institution_setup", recordId: actor.setup.id, userId: user.userId, newValue: { action: "setup.delegated", delegateUserId: row.id, canPurchaseSubscription: input.canPurchaseSubscription, replaced: actor.setup.delegateUserId ?? null } } });
    return row;
  });
  return { email: delegate.email, fullName: delegate.fullName, temporaryPassword: password };
}

/** Revoking ends the delegate's sessions at once; the setup itself is untouched. */
export async function revokeSetupDelegate(user: AuthUser) {
  const actor = await resolveSetupActor(user);
  if (actor.kind !== "owner") throw new AccessDenied("institution", "delegate", user);
  const delegateUserId = actor.setup.delegateUserId;
  if (!delegateUserId) return;
  await tenantTransaction(async (tx) => {
    await retireDelegate(tx, actor.school.id, delegateUserId);
    await tx.institutionSetup.update({ where: { schoolId: actor.school.id }, data: { delegateUserId: null, delegatedById: null, delegatedAt: null } });
    await tx.auditLog.create({ data: { schoolId: actor.school.id, tableName: "institution_setup", recordId: actor.setup.id, userId: user.userId, newValue: { action: "setup.delegate_revoked", delegateUserId } } });
  });
}
