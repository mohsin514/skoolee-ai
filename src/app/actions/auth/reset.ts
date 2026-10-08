'use server'
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { randomUUID } from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { headers } from "next/headers";
import { runUnscoped } from "@/lib/db/tenant-context";

async function limit(kind: string, key = "") {
  const h = await headers(); const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return (await authRateLimit(`${kind}:${ip}`, { limit: 5, windowMs: 300_000 })).ok && (await authRateLimit(`${kind}:target:${key}`, { limit: 5, windowMs: 300_000 })).ok;
}
export async function requestPasswordReset(email: string) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  // Same response for unknown, inactive, throttled and delivery-failure cases.
  if (!await limit("reset", normalized) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return { success: true };
  after(() => runUnscoped("password reset request before sign-in", async () => {
    const users = await prisma.user.findMany({ where: { email: normalized, isActive: true }, select: { id: true, schoolId: true } });
    for (const user of users) {
      const token = randomUUID();
      await prisma.passwordReset.create({ data: { email: normalized, userId: user.id, token, expiresAt: new Date(Date.now() + 3600_000) } });
      try { await sendPasswordResetEmail(normalized, token); }
      catch {
        await prisma.passwordReset.deleteMany({ where: { token } });
        await prisma.auditLog.create({ data: { schoolId: user.schoolId, userId: user.id, tableName: "account_security", recordId: user.id, newValue: { action: "password_reset.delivery_failed" } } });
      }
    }
  }).catch(() => { console.warn("[password-reset] delivery task failed"); }));
  return { success: true };
}
export async function verifyToken(token: string) {
  return runUnscoped("verify exact password reset token", async () => {
    if (!await limit("reset-verify", token)) return { valid: false };
    const request = await prisma.passwordReset.findUnique({ where: { token } });
    return { valid: Boolean(request?.userId && request.expiresAt > new Date()) };
  });
}
export async function resetPassword(token: string, newPassword: string) {
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 72) throw new Error("Use a password between 8 and 72 characters");
  if (!await limit("reset-accept", token)) throw new Error("Wait five minutes before trying again");
  return runUnscoped("redeem single-use password reset token", async () => {
    const request = await prisma.passwordReset.findUnique({ where: { token } });
    if (!request?.userId || request.expiresAt <= new Date()) throw new Error("Invalid or expired link. Request a new link.");
    const password = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction(async tx => {
      const claimed = await tx.passwordReset.deleteMany({ where: { token, expiresAt: { gt: new Date() } } });
      if (claimed.count !== 1) throw new Error("Invalid or expired link. Request a new link.");
      const user = await tx.user.update({ where: { id: request.userId! }, data: { password, accessVersion: { increment: 1 }, lastPasswordChange: new Date() } });
      await tx.loginSession.updateMany({ where: { userId: user.id }, data: { isActive: false, logoutAt: new Date() } });
      await tx.passwordReset.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, userId: user.id, tableName: "account_security", recordId: user.id, newValue: { action: "password_reset.completed", sessionsRevoked: true } } });
    });
    return { success: true };
  });
}
