import { assertSameOrigin } from "@/lib/auth/same-origin";
import { requireAuthUser, ApiError, errorResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { recoveryHash, revealSecret, verifyTotp } from "@/lib/auth/mfa-crypto";
import { startMfa } from "@/lib/auth/mfa-ticket";
import bcrypt from "bcryptjs";
/** Replacing a lost authenticator requires both password and a current second factor. */
export async function POST(req: Request) {
 try {
  assertSameOrigin(req);
  const principal = await requireAuthUser();
  if (!(await authRateLimit(`mfa-replace:${principal.userId}`, { limit: 5 })).ok) throw new ApiError("Wait five minutes before trying again", 429);
  const body = await req.json();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
  if (!user.mfaEnabled || !user.mfaSecret || !user.password || typeof body.password !== "string" || !await bcrypt.compare(body.password, user.password)) throw new ApiError("Credentials not accepted. Check your password and code.", 400);
  const code = String(body.code || "");
  const step = verifyTotp(revealSecret(user.mfaSecret), code, user.mfaLastStep);
  const hash = recoveryHash(code);
  if (step === null && !user.recoveryCodeHashes.includes(hash)) throw new ApiError("Use a current authenticator code or an unused recovery code.", 400);
  await prisma.$transaction(async tx => {
    const result = await tx.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, mfaEnabled: true, mfaLastStep: user.mfaLastStep, recoveryCodeHashes: { equals: user.recoveryCodeHashes } }, data: { mfaEnabled: false, mfaSecret: null, mfaLastStep: -1, recoveryCodeHashes: [], mfaPendingSecret: null, mfaPendingTicket: null, mfaPendingVerified: false, accessVersion: { increment: 1 } } });
    if (result.count !== 1) throw new ApiError("Security settings changed. Sign in again.", 409);
    await tx.loginSession.updateMany({ where: { userId: user.id }, data: { isActive: false, logoutAt: new Date() } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, userId: user.id, tableName: "account_security", recordId: user.id, newValue: { action: "mfa.replacement.started", sessionsRevoked: true } } });
  });
  return startMfa({ ...user, accessVersion: user.accessVersion + 1 }, 7);
 } catch (error) { return errorResponse(error, "[auth/mfa/replace]"); }
}
