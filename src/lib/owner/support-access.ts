import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db/prisma";
import { JWT_SECRET } from "@/lib/auth/secret";
import { ApiError } from "@/lib/api/scope";
import type { AuthUser } from "@/lib/auth";

export const SUPPORT_COOKIE = "skoolee_support_grant";
export const SUPPORT_SCOPE = ["school_profile", "operations", "users", "finance", "learning"] as const;
export const RESTRICTED_SUPPORT_SCOPE = ["safeguarding", "clinic", "counselling", "custody"] as const;
export const SUPPORT_ACTION = ["read", "write", "export"] as const;

// Keep the signed session marker alive long enough for the active page's
// expiry poll to record expiry and cancel pending work. Every operation still
// checks grant.expiresAt in the database before proceeding.
export function supportCookieExpiresAt(grantExpiresAt: Date) {
  return new Date(grantExpiresAt.getTime() + 24 * 60 * 60_000);
}

export function cleanSupportScope(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > SUPPORT_SCOPE.length) {
    throw new ApiError("Choose one or more allowed support domains", 400);
  }
  if (value.some((item) => RESTRICTED_SUPPORT_SCOPE.includes(item as never))) {
    throw new ApiError("Safeguarding, clinic, counselling and custody records cannot be included in a support grant", 403);
  }
  const result = [...new Set(value)];
  if (result.some((item) => !SUPPORT_SCOPE.includes(item as never))) throw new ApiError("Unsupported support domain", 400);
  return result;
}

export function cleanSupportActions(value: unknown): string[] {
  const result = value === undefined ? ["read"] : Array.isArray(value) ? [...new Set(value)] : [];
  if (!result.length || result.some((item) => !SUPPORT_ACTION.includes(item as never))) throw new ApiError("Choose allowed support actions", 400);
  if (!result.includes("read")) throw new ApiError("Support grants must include read access", 400);
  return result;
}

export function validateSupportGrantCombination(scope: string[], actions: string[]) {
  if (actions.includes("write") && scope.some((domain) => domain !== "school_profile")) {
    throw new ApiError("Support writes are limited to approved school profile fields", 400);
  }
  if (actions.includes("export") && scope.some((domain) => domain !== "school_profile")) {
    throw new ApiError("Support exports are limited to school profile data", 403);
  }
}

export function cleanSchoolProfileChange(value: unknown): { field: "phone" | "contactEmail" | "website"; value: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("A school profile field and value are required", 400);
  const input = value as { field?: unknown; value?: unknown };
  if (typeof input.field !== "string" || !["phone", "contactEmail", "website"].includes(input.field) || typeof input.value !== "string") {
    throw new ApiError("Support writes are limited to a school phone, email, or website field", 400);
  }
  const field = input.field as "phone" | "contactEmail" | "website";
  const next = input.value.trim();
  if (next.length > 180) throw new ApiError("School profile values are limited to 180 characters", 400);
  if (field === "contactEmail" && next && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) throw new ApiError("Enter a valid contact email", 400);
  if (field === "phone" && next && !/^\+?[\d\s().-]{7,25}$/.test(next)) throw new ApiError("Enter a valid school phone number", 400);
  if (field === "website" && next) {
    try { const url = new URL(next); if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid protocol"); }
    catch { throw new ApiError("Enter a valid http or https website", 400); }
  }
  return { field, value: next };
}

export async function issueSupportCookie(grant: { id: string; schoolId: string; requestedById: string; expiresAt: Date }) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ purpose: "support_grant", grantId: grant.id, schoolId: grant.schoolId, actorId: grant.requestedById })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt(now).setExpirationTime(Math.floor(supportCookieExpiresAt(grant.expiresAt).getTime() / 1000)).sign(JWT_SECRET);
}

export async function requireSupportGrant(actor: AuthUser, grantId?: string) {
  const token = (await cookies()).get(SUPPORT_COOKIE)?.value;
  if (!token) throw new ApiError("No active support grant", 403);
  let payload;
  try { payload = (await jwtVerify(token, JWT_SECRET)).payload; } catch { throw new ApiError("Support access expired. Request a new grant.", 403); }
  const expectedId = grantId || payload.grantId;
  if (payload.purpose !== "support_grant" || typeof expectedId !== "string" || payload.grantId !== expectedId || payload.actorId !== actor.userId) {
    throw new ApiError("Support grant does not match this actor", 403);
  }
  const grant = await prisma.supportGrant.findUnique({ where: { id: expectedId } });
  if (!grant || grant.schoolId !== payload.schoolId || grant.requestedById !== actor.userId || grant.status !== "active" || grant.revokedAt) {
    throw new ApiError("Support access has expired or been revoked", 403);
  }
  if (grant.expiresAt <= new Date()) {
    await stopSupportGrant(grant.id, actor.userId, "expired");
    throw new ApiError("Support access has expired", 403);
  }
  return grant;
}

export function auditSupport(actorId: string, action: string, grantId: string, details: Record<string, unknown> = {}) {
  return prisma.superAdminAuditLog.create({
    data: { userId: actorId, action, targetType: "support_grant", targetId: grantId, newValues: details as never },
  });
}

export async function stopSupportGrant(grantId: string, actorId: string, status: "revoked" | "expired" = "revoked") {
  const now = new Date();
  const grant = await prisma.$transaction(async (tx) => {
    const existing = await tx.supportGrant.findUnique({ where: { id: grantId } });
    if (!existing) throw new ApiError("Support grant not found", 404);
    if (["revoked", "expired", "rejected"].includes(existing.status)) return existing;
    const next = await tx.supportGrant.update({
      where: { id: grantId },
      data: { status, revokedAt: status === "revoked" ? now : existing.revokedAt },
    });
    await tx.supportAction.updateMany({ where: { grantId, status: "queued" }, data: { status: "cancelled", completedAt: now } });
    if (status === "revoked" || status === "expired") {
      await tx.workflowJob.updateMany({ where: { supportGrantId: grantId, state: "queued" }, data: { cancelRequestedAt: now } });
    }
    await tx.superAdminAuditLog.create({ data: {
      userId: actorId, action: `support_access_${status}`, targetType: "support_grant", targetId: grantId,
      newValues: { schoolId: next.schoolId, status },
    } });
    return next;
  });
  return grant;
}
