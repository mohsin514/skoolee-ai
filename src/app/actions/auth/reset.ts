'use server'

import { prisma } from "@/lib/db/prisma";
import { randomUUID } from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { enterUnscoped } from "@/lib/db/tenant-context";

export async function requestPasswordReset(email: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok } = rateLimit(`reset:${ip}`, { limit: 3, windowMs: 300_000 });
  if (!ok) {
    throw new Error("Too many reset requests. Please try again in a few minutes.");
  }

  // Pre-auth: the user has no session yet and is identified only by an email
  // that maps to exactly one account across all schools.
  enterUnscoped("password reset request: look up account by email before sign-in");

  // FINDING-D: identity is tenant-scoped, so one address may hold accounts at
  // several schools. Issue a token PER ACCOUNT, each bound to its user, rather
  // than one token keyed on the email — which would be ambiguous at redemption
  // and could reset the wrong account.
  const users = await prisma.user.findMany({ where: { email }, select: { id: true } });

  // Always return success even when nothing matched, so the endpoint cannot be
  // used to test whether an address exists.
  if (users.length === 0) {
    return { success: true };
  }

  const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

  for (const user of users) {
    const token = randomUUID();
    await prisma.passwordReset.create({
      data: { email, userId: user.id, token, expiresAt },
    });
    await sendPasswordResetEmail(email, token);
  }

  return { success: true };
}

export async function verifyToken(token: string) {
  const resetRequest = await prisma.passwordReset.findUnique({ where: { token } });
  
  if (!resetRequest || resetRequest.expiresAt < new Date()) {
    return { valid: false };
  }
  
  return { valid: true };
}

export async function resetPassword(token: string, newPassword: string) {
  // Pre-auth: the reset token is the only credential; the account it belongs
  // to is resolved by email across all schools.
  enterUnscoped("password reset: apply new password via single-use token before sign-in");

  const resetRequest = await prisma.passwordReset.findUnique({ where: { token } });
  
  if (!resetRequest || resetRequest.expiresAt < new Date()) {
    throw new Error("Invalid or expired token");
  }

  // The token names exactly one account. Older tokens predate userId and have
  // no unambiguous target, so they are refused rather than guessed at.
  if (!resetRequest.userId) {
    throw new Error("This reset link is no longer valid. Please request a new one.");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: resetRequest.userId },
    data: { password: hashedPassword }
  });

  // Clean up
  await prisma.passwordReset.delete({ where: { token } });

  return { success: true };
}
