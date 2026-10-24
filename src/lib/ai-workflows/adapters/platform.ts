import { createHash } from "node:crypto";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { SchoolAiError } from "@/lib/school-ai/access";
import { createPilot, PilotError } from "@/lib/pilots/service";
import type { ToolAction } from "./tool-schemas";
export async function executePlatformAction(user: AuthUser, key: string, action: ToolAction) {
 if (user.role !== "APP_OWNER") throw new SchoolAiError("Platform administration is restricted to the application owner.", 403);
 return runUnscoped(PLATFORM_UNSCOPED_REASON, async () => {
  if (action.tool === "platform.inspect") {
   const schools = await prisma.school.findMany({ where: action.data.search ? { name: { contains: action.data.search, mode: "insensitive" } } : {}, select: { id: true, name: true, city: true, website: true, status: true, plan: true, _count: { select: { campuses: true } } }, orderBy: { name: "asc" }, take: 51 });
   return { operation: action.tool, schools: schools.slice(0,50), truncated: schools.length > 50 };
  }
  if (action.tool !== "platform.update_institution") throw new SchoolAiError("Unsupported platform action.", 422);
  const fingerprint = createHash("sha256").update(JSON.stringify(action)).digest("hex");
  return prisma.$transaction(async tx => {
   await tx.$queryRaw`SELECT id FROM schools WHERE id=${user.schoolId} FOR UPDATE`;
   const previous = await tx.schoolAiRequest.findFirst({ where: { schoolId: user.schoolId, actorId: user.userId, feature: "AUTOMATIC_ACTION_V1", idempotencyKey: key } });
   if (previous) { if (previous.requestHash !== fingerprint) throw new SchoolAiError("This action has changed.", 409); return JSON.parse(previous.reply!); }
   const { schoolId, ...data } = action.data;
   const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true, city: true, website: true } });
   if (!school) throw new SchoolAiError("Institution not found.", 404);
   await tx.school.update({ where: { id: schoolId }, data });
   const receipt = { id: schoolId, operation: action.tool, updatedFields: Object.keys(data) };
   await tx.auditLog.create({ data: { schoolId, userId: user.userId, tableName: "school", recordId: schoolId, oldValue: school, newValue: { ...data, source: "AUTOMATIC_PLATFORM_REQUEST" } } });
   await tx.schoolAiRequest.create({ data: { schoolId: user.schoolId, actorId: user.userId, actorRole: user.role, feature: "AUTOMATIC_ACTION_V1", idempotencyKey: key, requestHash: fingerprint, status: "COMPLETED", completedAt: new Date(), reply: JSON.stringify(receipt) } });
   return receipt;
  });
 });
}

/* ───────────────────────── Slice 8: the owner desk (RT9) ─────────────────────────
 * Every platform unit runs in the owner's own request (the worker never claims APP_OWNER jobs) and
 * leaves the tenant guard only here, under the reason its registry entry states in
 * `scope.unscopedReason`. Reads return ids, codes and booleans; tenant-authored strings (school
 * names) are returned only where the owner must choose between them. Nothing below writes except
 * `createPilotDraft`, which records a PLANNED (draft) charter and an audit row naming the reason.
 */
export const PLATFORM_UNSCOPED_REASON = "authorized automatic platform administration";

function asOwner<T>(user: AuthUser, reason: string, work: () => Promise<T>): Promise<T> {
  if (user.role !== "APP_OWNER") return Promise.reject(new SchoolAiError("Platform administration is restricted to the application owner.", 403));
  if (!reason.trim()) return Promise.reject(new SchoolAiError("A platform action needs its stated reason.", 500));
  return runUnscoped(reason, work);
}

/** Questionnaire prefill: schools with no city on record, oldest first. */
export function listSchoolsMissingCity(user: AuthUser, limit = 10): Promise<Array<{ id: string; name: string }>> {
  return asOwner(user, PLATFORM_UNSCOPED_REASON, () => prisma.school.findMany({
    where: { city: "", status: { not: "DELETED" } }, select: { id: true, name: true }, orderBy: { createdAt: "asc" }, take: Math.min(Math.max(limit, 1), 50),
  }));
}

export interface PlatformSchool { id: string; name: string; regId: string; slug: string; city: string; status: string; plan: string }
const SCHOOL_SELECT = { id: true, name: true, regId: true, slug: true, city: true, status: true, plan: true } as const;

/** Schools the owner named: an exact registration id or slug first, then name matches (max 6). */
export function findSchools(user: AuthUser, reason: string, text: string): Promise<PlatformSchool[]> {
  const needle = text.trim();
  return asOwner(user, reason, async () => {
    const exact = await prisma.school.findMany({ where: { OR: [{ regId: needle }, { slug: needle.toLowerCase() }] }, select: SCHOOL_SELECT, take: 2 });
    if (exact.length === 1) return exact;
    const named = await prisma.school.findMany({ where: { name: { equals: needle, mode: "insensitive" } }, select: SCHOOL_SELECT, take: 6 });
    if (named.length) return named;
    return prisma.school.findMany({ where: { name: { contains: needle, mode: "insensitive" }, status: { not: "DELETED" } }, select: SCHOOL_SELECT, orderBy: { name: "asc" }, take: 6 });
  });
}

/** The school's own locale-policy country (the pilot charter's country), or null. */
export function schoolCountry(user: AuthUser, reason: string, schoolId: string): Promise<string | null> {
  return asOwner(user, reason, async () => {
    const policy = await prisma.localePolicy.findFirst({ where: { schoolId, scopeKey: "school" }, orderBy: { effectiveAt: "desc" }, select: { settings: true } });
    const country = (policy?.settings as { country?: unknown } | null)?.country;
    return typeof country === "string" && /^[A-Z]{2}$/.test(country) ? country : null;
  });
}

/** The receipt shares the automation feature (a DB check constrains `feature`); its key is namespaced. */
const PILOT_FEATURE = "AUTOMATIC_ACTION_V1";
const pilotKey = (key: string) => `platform.pilot_create:${key}`;
/**
 * Creates the pilot through the pilots service (status PLANNED: the domain's draft; ACTIVE needs the
 * school's consent on the Pilot evidence screen). Replay: our receipt by key, then the natural match
 * (same creator, name, start and school) for a crash between the create and the receipt.
 */
export function createPilotDraft(user: AuthUser, reason: string, data: Record<string, unknown> & { name: string; startsOn: string; targetSchoolId: string | null }, idempotencyKey: string) {
  return asOwner(user, reason, async () => {
    const requestHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const previous = await prisma.schoolAiRequest.findFirst({ where: { schoolId: user.schoolId, actorId: user.userId, feature: PILOT_FEATURE, idempotencyKey: pilotKey(idempotencyKey) } });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new SchoolAiError("This action has changed.", 409);
      return { ...(JSON.parse(previous.reply!) as { id: string; status: string; workflows: string[] }), replayed: true };
    }
    const existing = await prisma.pilot.findFirst({ where: { createdById: user.userId, name: data.name, startsOn: new Date(`${data.startsOn}T00:00:00Z`), targetSchoolId: data.targetSchoolId } });
    const pilot = existing ?? await createPilot(data, user.userId).catch((error: unknown) => {
      throw error instanceof PilotError ? new SchoolAiError(error.message, error.status) : error;
    });
    const receipt = { id: pilot.id, status: pilot.status, workflows: Array.isArray(pilot.workflows) ? (pilot.workflows as Array<{ key: string }>).map(row => row.key) : [] };
    if (!existing) await prisma.superAdminAuditLog.create({ data: { userId: user.userId, action: "pilot_created", targetType: "pilot", targetId: pilot.id, targetName: pilot.name, newValues: { status: pilot.status, targetSchoolId: data.targetSchoolId, workflows: receipt.workflows, source: "AI_WORKFLOWS", unscopedReason: reason } } });
    await prisma.schoolAiRequest.create({ data: { schoolId: user.schoolId, actorId: user.userId, actorRole: user.role, feature: PILOT_FEATURE, idempotencyKey: pilotKey(idempotencyKey), requestHash, status: "COMPLETED", completedAt: new Date(), reply: JSON.stringify(receipt) } });
    return { ...receipt, replayed: Boolean(existing) };
  });
}

/** Provider events parked for review (NEEDS_REVIEW / FAILED): by exact event id, or for given schools. */
export function waitingProviderEvents(user: AuthUser, reason: string, where: { eventId?: string; schoolIds?: string[] }) {
  return asOwner(user, reason, () => prisma.stripeWebhookReceipt.findMany({
    where: { state: { in: ["NEEDS_REVIEW", "FAILED"] }, ...(where.eventId ? { eventId: where.eventId } : {}), ...(where.schoolIds ? { schoolId: { in: where.schoolIds } } : {}) },
    select: { eventId: true, provider: true, eventType: true, state: true, schoolId: true, receivedAt: true }, orderBy: { receivedAt: "asc" }, take: 6,
  }));
}

/** Subscription requests still PENDING_REVIEW for one school (optionally one kind). */
export function pendingSubscriptionRequests(user: AuthUser, reason: string, schoolId: string, kind?: string) {
  return asOwner(user, reason, () => prisma.subscriptionRequest.findMany({
    where: { schoolId, state: "PENDING_REVIEW", ...(kind ? { kind } : {}) },
    select: { id: true, kind: true, requestedPlan: true, effectiveAt: true, createdAt: true, details: true }, orderBy: { createdAt: "asc" }, take: 6,
  }));
}

/** Mirrors provisioning's assertEmailAvailable: true when the address is already a school contact. */
export function schoolContactTaken(user: AuthUser, reason: string, email: string) {
  return asOwner(user, reason, async () => Boolean(await prisma.school.findUnique({ where: { contactEmail: email.trim().toLowerCase() }, select: { id: true } })));
}

const DEFAULT_PRICING = { FREE: { price: 0 }, BASIC: { price: 4000 }, PRO: { price: 7000 }, ENTERPRISE: { price: null } };
/** The current default plan prices, as GET /api/owner/platform-config reports them. */
export function defaultPlanPricing(user: AuthUser, reason: string) {
  return asOwner(user, reason, async () => {
    const config = await prisma.platformConfig.findUnique({ where: { key: "default_plan_pricing" } });
    return ((config?.value as Record<string, { price?: number | null }> | null) ?? DEFAULT_PRICING) as Record<string, { price?: number | null }>;
  });
}

/** Payment gateway state as booleans only: never the account id, account number or IBAN. */
export function paymentGatewayState(user: AuthUser, reason: string) {
  return asOwner(user, reason, async () => {
    const value = ((await prisma.platformConfig.findUnique({ where: { key: "payment_settings" } }))?.value ?? {}) as Record<string, unknown>;
    return { stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY), connected: Boolean(value.connectedAccountId), onboardingComplete: Boolean(value.onboardingComplete), chargesEnabled: Boolean(value.chargesEnabled), bankConfigured: Boolean(value.bankName && value.accountNumber) };
  });
}

/** Accounts with this sign-in email (any school) and their active session ids. Tokens and IPs never leave. */
export function activeSessionsForEmail(user: AuthUser, reason: string, email: string) {
  return asOwner(user, reason, async () => {
    const accounts = await prisma.user.findMany({ where: { email: { equals: email.trim(), mode: "insensitive" } }, select: { id: true, role: true, schoolId: true }, take: 6 });
    const sessions = accounts.length ? await prisma.loginSession.findMany({ where: { userId: { in: accounts.map(row => row.id) }, isActive: true, expiresAt: { gt: new Date() } }, select: { id: true, userId: true }, orderBy: { loginAt: "desc" }, take: 50 }) : [];
    return { accounts, sessions };
  });
}
