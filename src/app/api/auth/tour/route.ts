import type { Prisma } from "@prisma/client";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { requireAuthUser, errorResponse, ApiError } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { JWT_SECRET } from "@/lib/auth/secret";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { candidateExamBoundary } from "@/lib/school-ai/exam-boundary-service";
import { parseTourProgress, recordTourProgress, tourProgressInput } from "@/lib/onboarding/tours";
import type { AuthUser } from "@/lib/auth";

const headers = { "Cache-Control": "private, no-store" };
/** The signed support-session marker (src/lib/owner/support-access.ts `SUPPORT_COOKIE`). */
const SUPPORT_COOKIE = "skoolee_support_grant";

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value || null;
    }
  }
  return null;
}

/**
 * A scoped support session is a live grant, not merely a cookie: the signed marker must verify for this actor, and
 * its grant must still be active, unrevoked and unexpired — the same checks as requireSupportGrant, read-only. A stale
 * cookie (an expired or revoked grant; the marker outlives its grant by a day) never switches tours off.
 */
async function inSupportSession(request: Request, user: AuthUser): Promise<boolean> {
  const token = cookieValue(request, SUPPORT_COOKIE);
  if (!token) return false;
  let payload: Record<string, unknown>;
  try { payload = (await jwtVerify(token, JWT_SECRET)).payload; } catch { return false; }
  const { purpose, grantId, schoolId, actorId } = payload;
  if (purpose !== "support_grant" || typeof grantId !== "string" || typeof schoolId !== "string" || actorId !== user.userId) return false;
  const grant = await runUnscoped("tour: the authenticated account's own support grant", () => prisma.supportGrant.findFirst({
    where: { id: grantId, schoolId, requestedById: user.userId, status: "active", revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  }));
  return grant !== null;
}
/** Compare-and-swap attempts before a concurrent writer is reported as a conflict (409; the client does not retry). */
const MAX_ATTEMPTS = 4;

/**
 * Spotlight tour progress for the signed-in account only (SPEC §9.5). Readable while the school is suspended so the
 * minimal shell does not error; `autoStartBlocked` tells the client never to auto-start a tour over a password change,
 * a candidate exam, a suspended school or a scoped support session.
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    const account = await runUnscoped("tour: read only the authenticated account", () => prisma.user.findFirst({
      where: { id: user.userId, schoolId: user.schoolId, isActive: true },
      select: { tourProgress: true, welcomeCompletedAt: true, mustChangePassword: true },
    }));
    if (!account) throw new ApiError("Unauthorized", 401);
    const support = await inSupportSession(request, user);
    const suspended = user.role === "APP_OWNER" ? false : await assertSchoolOperational(user.schoolId).then(() => false, () => true);
    const inExam = user.role === "STUDENT" ? Boolean(await candidateExamBoundary(user).catch(() => null)) : false;
    return Response.json({
      progress: parseTourProgress(account.tourProgress),
      userId: user.userId,
      welcomeCompleted: Boolean(account.welcomeCompletedAt),
      autoStartBlocked: account.mustChangePassword || support || suspended || inExam,
      // A scoped support session never runs a tour, manual ones included, and never records progress (§9.1).
      supportSession: support,
    }, { headers });
  } catch (error) { return errorResponse(error, "Unable to load your tour progress."); }
}

/**
 * Records "done" or "dismissed" for one tour version on the caller's own row. Idempotent; never accepts a user id.
 * The read-merge-write is a compare-and-swap: the update only lands while the row still holds the JSON that was read,
 * so two tabs finishing different tours at the same moment both keep their record (the loser re-reads and merges).
 * During a scoped support session nothing is written.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser({ allowSuspended: true });
    const parsed = tourProgressInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError("Unknown tour or status", 400);
    if (await inSupportSession(request, user)) return Response.json({ ok: true }, { headers });
    await runUnscoped("tour: record progress on the authenticated account only", async () => {
      const own = { id: user.userId, schoolId: user.schoolId, isActive: true };
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const account = await prisma.user.findFirst({ where: own, select: { tourProgress: true } });
        if (!account) throw new ApiError("Unauthorized", 401);
        const next = recordTourProgress(account.tourProgress, parsed.data, new Date());
        if (!next) return;
        const written = await prisma.user.updateMany({
          where: { ...own, tourProgress: { equals: account.tourProgress as Prisma.InputJsonValue } },
          data: { tourProgress: next as Prisma.InputJsonValue },
        });
        if (written.count > 0) return;
      }
      throw new ApiError("Your tour progress changed in another window. Try again.", 409);
    });
    return Response.json({ ok: true }, { headers });
  } catch (error) { return errorResponse(error, "Unable to save your tour progress."); }
}
