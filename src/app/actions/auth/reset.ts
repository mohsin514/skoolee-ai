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

  const user = await prisma.user.findUnique({ where: { email } });

  // Security best practice: Always return success even if user doesn't exist to prevent email enumeration
  if (!user) {
    return { success: true };
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

  await prisma.passwordReset.create({
    data: {
      email,
      token,
      expiresAt
    }
  });

  await sendPasswordResetEmail(email, token);

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

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email: resetRequest.email },
    data: { password: hashedPassword }
  });

  // Clean up
  await prisma.passwordReset.delete({ where: { token } });

  return { success: true };
}
