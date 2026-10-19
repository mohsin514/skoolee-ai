'use server'
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createHash, randomBytes } from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { headers } from "next/headers";
import { runUnscoped } from "@/lib/db/tenant-context";
import { clientIp } from "@/lib/http/client-ip";

async function limit(kind: string, key = "") {
  const ip = clientIp(await headers());
  return (await authRateLimit(`${kind}:${ip}`, { limit: 5, windowMs: 300_000 })).ok && (await authRateLimit(`${kind}:target:${key}`, { limit: 5, windowMs: 300_000 })).ok;
}
/** SKO-457: only a SHA-256 digest of a reset token is stored; the link carries the token itself. */
const digest = (token: unknown) => createHash("sha256").update(typeof token === "string" ? token : "").digest("hex");
type ResetResult = { success: true } | { success: false; error: string };

export async function requestPasswordReset(email: string) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  // Same response for unknown, inactive, throttled and delivery-failure cases.
  if (!await limit("reset", normalized) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return { success: true };
  after(() => runUnscoped("password reset request before sign-in", async () => {
    const users = await prisma.user.findMany({ where: { email: normalized, isActive: true }, select: { id: true, schoolId: true, preferredLanguage: true } });
    for (const user of users) {
      const token = randomBytes(32).toString("base64url");
      await prisma.passwordReset.create({ data: { email: normalized, userId: user.id, token: digest(token), expiresAt: new Date(Date.now() + 3600_000) } });
      try { await sendPasswordResetEmail(normalized, token, user.preferredLanguage); }
      catch {
        await prisma.passwordReset.deleteMany({ where: { token: digest(token) } });
        await prisma.auditLog.create({ data: { schoolId: user.schoolId, userId: user.id, tableName: "account_security", recordId: user.id, newValue: { action: "password_reset.delivery_failed" } } });
      }
    }
  }).catch(() => { console.warn("[password-reset] delivery task failed"); }));
  return { success: true };
}
export async function verifyToken(token: string) {
  return runUnscoped("verify exact password reset token", async () => {
    if (!await limit("reset-verify", token)) return { valid: false };
    const request = await prisma.passwordReset.findUnique({ where: { token: digest(token) } });
    return { valid: Boolean(request?.userId && request.expiresAt > new Date()) };
  });
}
export async function resetPassword(token: string, newPassword: string): Promise<ResetResult> {
  // Errors are returned, not thrown: production builds hide thrown server-action messages.
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 72) return { success: false, error: "Use a password between 8 and 72 characters" };
  if (!await limit("reset-accept", token)) return { success: false, error: "Wait five minutes before trying again" };
  const expired = { success: false, error: "Invalid or expired link. Request a new link." } as const;
  return runUnscoped("redeem single-use password reset token", async (): Promise<ResetResult> => {
    const hashed = digest(token);
    const request = await prisma.passwordReset.findUnique({ where: { token: hashed } });
    if (!request?.userId || request.expiresAt <= new Date()) return expired;
    const password = await bcrypt.hash(newPassword, 12);
    const claimed = await prisma.$transaction(async tx => {
      const claim = await tx.passwordReset.deleteMany({ where: { token: hashed, expiresAt: { gt: new Date() } } });
      if (claim.count !== 1) return false;
      const user = await tx.user.update({ where: { id: request.userId! }, data: { password, accessVersion: { increment: 1 }, lastPasswordChange: new Date() } });
      await tx.loginSession.updateMany({ where: { userId: user.id }, data: { isActive: false, logoutAt: new Date() } });
      await tx.passwordReset.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, userId: user.id, tableName: "account_security", recordId: user.id, newValue: { action: "password_reset.completed", sessionsRevoked: true } } });
      return true;
    });
    return claimed ? { success: true } : expired;
  });
}
